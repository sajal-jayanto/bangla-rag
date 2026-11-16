import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { logger } from "../config/logger.js";

// `migrations/` sits at the project root, next to both `src/` (dev) and `dist/` (build).
const migrationsDir = path.resolve(import.meta.dirname, "..", "..", "migrations");

interface Migration {
  id: string;
  sql: string;
}

// Files are applied in filename order (e.g. 001_init.sql, 002_add_x.sql); the id is the
// filename without `.sql`. Add a new file for each change; never edit one that has already run.
const loadMigrations = async (): Promise<Migration[]> => {
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(path.join(migrationsDir, file), "utf8");
      return { id: file.slice(0, -".sql".length), sql };
    }),
  );
};

export const runMigrations = async (pool: pg.Pool): Promise<void> => {
  const migrations = await loadMigrations();
  const client = await pool.connect();
  try {
    // Serialize concurrent starts (e.g. several API replicas) on a fixed advisory lock.
    await client.query("SELECT pg_advisory_lock(727274)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
        await client.query("COMMIT");
        logger.info(`🗄️  Applied migration ${migration.id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => undefined);
    client.release();
  }
};
