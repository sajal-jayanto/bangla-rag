import type pg from "pg";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { ProjectPriority, ProjectRow, ProjectStatus } from "../models/project.model.js";

export interface CreateProjectData {
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
}

export interface UpdateProjectData {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
}

const UNIQUE_VIOLATION = "23505";
const UPDATABLE_COLUMNS = ["name", "description", "status", "priority"] as const;

const isPgError = (err: unknown): err is { code: string } =>
  typeof err === "object" && err !== null && "code" in err;

export class SlugTakenError extends Error {}

export class ProjectRepository {
  constructor(private readonly db: pg.Pool) {}

  async create(data: CreateProjectData): Promise<ProjectRow> {
    try {
      const { rows } = await this.db.query<ProjectRow>(
        `INSERT INTO projects (owner_id, name, slug, description, status, priority)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'planning'), COALESCE($6, 'mid'))
         RETURNING *`,
        [
          data.ownerId,
          data.name,
          data.slug,
          data.description,
          data.status ?? null,
          data.priority ?? null,
        ],
      );
      return rows[0];
    } catch (err) {
      if (isPgError(err) && err.code === UNIQUE_VIOLATION) {
        throw new SlugTakenError(`Slug "${data.slug}" is taken`, { cause: err });
      }
      throw new HttpError("Failed to create project", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async findSlugsLike(ownerId: string, base: string): Promise<string[]> {
    try {
      const { rows } = await this.db.query<{ slug: string }>(
        `SELECT slug FROM projects
         WHERE owner_id = $1 AND NOT is_deleted AND (slug = $2 OR slug LIKE $2 || '-%')`,
        [ownerId, base],
      );
      return rows.map((r) => r.slug);
    } catch (err) {
      throw new HttpError("Failed to create project", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async findAllByOwner(ownerId: string): Promise<ProjectRow[]> {
    try {
      const { rows } = await this.db.query<ProjectRow>(
        `SELECT * FROM projects
         WHERE owner_id = $1 AND NOT is_deleted
         ORDER BY created_at DESC, id DESC`,
        [ownerId],
      );
      return rows;
    } catch (err) {
      throw new HttpError("Failed to load projects", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async findById(ownerId: string, id: string): Promise<ProjectRow | null> {
    try {
      const { rows } = await this.db.query<ProjectRow>(
        "SELECT * FROM projects WHERE id = $1 AND owner_id = $2 AND NOT is_deleted",
        [id, ownerId],
      );
      return rows[0] ?? null;
    } catch (err) {
      throw new HttpError("Failed to load project", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async update(ownerId: string, id: string, data: UpdateProjectData): Promise<ProjectRow | null> {
    const values: unknown[] = [id, ownerId];
    const sets = ["updated_at = now()"];
    for (const column of UPDATABLE_COLUMNS) {
      if (data[column] !== undefined) {
        values.push(data[column]);
        sets.push(`${column} = $${values.length}`);
      }
    }

    try {
      const { rows } = await this.db.query<ProjectRow>(
        `UPDATE projects SET ${sets.join(", ")}
         WHERE id = $1 AND owner_id = $2 AND NOT is_deleted
         RETURNING *`,
        values,
      );
      return rows[0] ?? null;
    } catch (err) {
      throw new HttpError("Failed to update project", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async softDelete(ownerId: string, id: string): Promise<boolean> {
    try {
      const { rowCount } = await this.db.query(
        `UPDATE projects SET is_deleted = true, updated_at = now()
         WHERE id = $1 AND owner_id = $2 AND NOT is_deleted`,
        [id, ownerId],
      );
      return rowCount === 1;
    } catch (err) {
      throw new HttpError("Failed to delete project", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }
}
