import { logger } from "../config/logger.js";
import { pool } from "./pool.js";
import { runMigrations } from "./migrate.js";

try {
  await runMigrations(pool);
  logger.info("✅ Migrations up to date");
} catch (err) {
  logger.fatal({ err }, "❌ Migration failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
