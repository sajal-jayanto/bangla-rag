import type pg from "pg";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { DocumentRow } from "../models/document.model.js";

export type CreateDocumentData = Omit<DocumentRow, "id" | "created_at">;

// Ownership is checked by the caller through the project (see DocumentService).
export class DocumentRepository {
  constructor(private readonly db: pg.Pool) {}

  async create(data: CreateDocumentData): Promise<DocumentRow> {
    try {
      const { rows } = await this.db.query<DocumentRow>(
        `INSERT INTO documents (
           project_id, uploaded_by, file_name, mime_type, size_bytes, sha256, kind,
           page_count, pages_processed, text_length, pdf_info, ocr_status, ocr_error, ocr_duration_ms
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
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
        ],
      );
      return rows[0];
    } catch (err) {
      throw new HttpError("Failed to save document metadata", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
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

  async findById(projectId: string, id: string): Promise<DocumentRow | null> {
    try {
      const { rows } = await this.db.query<DocumentRow>(
        "SELECT * FROM documents WHERE id = $1 AND project_id = $2",
        [id, projectId],
      );
      return rows[0] ?? null;
    } catch (err) {
      throw new HttpError("Failed to load document", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }
}
