import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export const pool = new pg.Pool({
  connectionString: env.db.url,
  max: 10,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => logger.error({ err }, "PostgreSQL pool error"));

export const connectDB = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ db: string; version: string }>(
      "SELECT current_database() AS db, current_setting('server_version') AS version",
    );
    logger.info(`✅ PostgreSQL connected [${rows[0]?.db}, v${rows[0]?.version}]`);
  } finally {
    client.release();
  }
};

export const disconnectDB = async (): Promise<void> => {
  await pool.end();
  logger.info("PostgreSQL pool closed");
};
