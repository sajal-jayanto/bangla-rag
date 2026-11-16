import type pg from "pg";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";

export interface ChunkMatch {
  id: string;
  document_id: string;
  file_name: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  /** Cosine similarity to the query, from -1 to 1 (higher is closer). */
  similarity: number;
}

/** pgvector's text form: `[0.1,0.2,...]`. */
export const toVectorLiteral = (values: number[]): string => `[${values.join(",")}]`;

// Ownership is checked by the caller through the project (see SearchService).
export class ChunkRepository {
  constructor(private readonly db: pg.Pool) {}

  /** The project's chunks closest to `embedding` by cosine distance, at or above `minSimilarity`. */
  async searchByProject(
    projectId: string,
    embedding: number[],
    limit: number,
    minSimilarity: number,
  ): Promise<ChunkMatch[]> {
    try {
      const { rows } = await this.db.query<ChunkMatch>(
        `SELECT * FROM (
           SELECT c.id, c.document_id, d.file_name, c.chunk_index, c.page_number, c.content,
                  1 - (c.embedding <=> $2::vector) AS similarity
           FROM chunks c
           JOIN documents d ON d.id = c.document_id
           WHERE c.project_id = $1
           ORDER BY c.embedding <=> $2::vector
           LIMIT $3
         ) nearest
         WHERE similarity >= $4
         ORDER BY similarity DESC`,
        [projectId, toVectorLiteral(embedding), limit, minSimilarity],
      );
      return rows;
    } catch (err) {
      throw new HttpError("Failed to search documents", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }
}
