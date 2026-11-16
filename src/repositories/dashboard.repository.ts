import type pg from "pg";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";

export interface DatabaseInfo {
  postgresVersion: string;
  pgvectorVersion: string | null;
}

export class DashboardRepository {
  constructor(private readonly db: pg.Pool) {}

  async getDatabaseInfo(): Promise<DatabaseInfo> {
    try {
      const { rows } = await this.db.query<{ pg: string; vector: string | null }>(
        `SELECT current_setting('server_version') AS pg,
                (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vector`,
      );
      return { postgresVersion: rows[0].pg, pgvectorVersion: rows[0].vector };
    } catch (err) {
      throw new HttpError("Failed to load database info", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }
}
