import type pg from "pg";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { DocumentRow } from "../models/document.model.js";
import { toVectorLiteral } from "./chunk.repository.js";

export type CreateDocumentData = Omit<DocumentRow, "id" | "created_at">;

export interface NewChunk {
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
  embedding: number[];
}

const INSERT_DOCUMENT = `
  INSERT INTO documents (
    project_id, uploaded_by, file_name, mime_type, size_bytes, sha256, kind,
    page_count, pages_processed, text_length, pdf_info, ocr_status, ocr_error, ocr_duration_ms,
    chunk_count, embedding_model
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
  RETURNING *`;

const documentValues = (data: CreateDocumentData): unknown[] => [
  data.project_id,
  data.uploaded_by,
  data.file_name,
  data.mime_type,
  data.size_bytes,
  data.sha256,
  data.kind,
  data.page_count,
  data.pages_processed,
  data.text_length,
  data.pdf_info ? JSON.stringify(data.pdf_info) : null,
  data.ocr_status,
  data.ocr_error,
  data.ocr_duration_ms,
  data.chunk_count,
  data.embedding_model,
];

export class DocumentRepository {
  constructor(private readonly db: pg.Pool) {}

  async create(data: CreateDocumentData): Promise<DocumentRow> {
    try {
      const { rows } = await this.db.query<DocumentRow>(INSERT_DOCUMENT, documentValues(data));
      return rows[0];
    } catch (err) {
      throw new HttpError("Failed to save document metadata", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async createWithChunks(data: CreateDocumentData, chunks: NewChunk[]): Promise<DocumentRow> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<DocumentRow>(INSERT_DOCUMENT, documentValues(data));
      const document = rows[0];

      if (chunks.length > 0) {
        await client.query(
          `INSERT INTO chunks (document_id, project_id, chunk_index, page_number, content, embedding)
           SELECT $1, $2, t.chunk_index, t.page_number, t.content, t.embedding::vector
           FROM unnest($3::int[], $4::int[], $5::text[], $6::text[])
             AS t(chunk_index, page_number, content, embedding)`,
          [
            document.id,
            document.project_id,
            chunks.map((c) => c.chunkIndex),
            chunks.map((c) => c.pageNumber),
            chunks.map((c) => c.content),
            chunks.map((c) => toVectorLiteral(c.embedding)),
          ],
        );
      }

      await client.query("COMMIT");
      return document;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new HttpError("Failed to save document and chunks", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    } finally {
      client.release();
    }
  }

  async findAllByProject(projectId: string): Promise<DocumentRow[]> {
    try {
      const { rows } = await this.db.query<DocumentRow>(
        "SELECT * FROM documents WHERE project_id = $1 ORDER BY created_at DESC, id DESC",
        [projectId],
      );
      return rows;
    } catch (err) {
      throw new HttpError("Failed to load documents", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }
}
