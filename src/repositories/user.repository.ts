import type pg from "pg";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { UserRole, UserRow } from "../models/user.model.js";

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

const UNIQUE_VIOLATION = "23505";

const isPgError = (err: unknown): err is { code: string } =>
  typeof err === "object" && err !== null && "code" in err;

export class UserRepository {
  constructor(private readonly db: pg.Pool) {}

  async create(data: CreateUserData): Promise<UserRow> {
    try {
      const { rows } = await this.db.query<UserRow>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [data.name, data.email, data.passwordHash, data.role ?? "user"],
      );
      return rows[0];
    } catch (err) {
      if (isPgError(err) && err.code === UNIQUE_VIOLATION) {
        throw new HttpError("Email is already registered", StatusCodes.CONFLICT, { cause: err });
      }
      throw new HttpError("Failed to create user", StatusCodes.INTERNAL_SERVER_ERROR, {
        cause: err,
      });
    }
  }

  async findById(id: string): Promise<UserRow | null> {
    try {
      const { rows } = await this.db.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
      return rows[0] ?? null;
    } catch (err) {
      throw new HttpError("Failed to find user", StatusCodes.INTERNAL_SERVER_ERROR, { cause: err });
    }
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    try {
      const { rows } = await this.db.query<UserRow>(
        "SELECT * FROM users WHERE lower(email) = lower($1)",
        [email],
      );
      return rows[0] ?? null;
    } catch (err) {
      throw new HttpError("Failed to find user", StatusCodes.INTERNAL_SERVER_ERROR, { cause: err });
    }
  }
}
