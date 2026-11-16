import createbootstrapApp from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDB, disconnectDB, pool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

const app = createbootstrapApp();
const PORT = env.port;

const bootstrapServer = async () => {
  try {
    await connectDB();
    await runMigrations(pool);
  } catch (err) {
    logger.fatal({ err }, "❌ Failed to prepare PostgreSQL. Shutting down.");
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`✅ Service listening on port ${PORT} [${env.nodeEnv}]`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      disconnectDB()
        .catch((err: unknown) => logger.error({ err }, "Error while closing PostgreSQL pool"))
        .finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

bootstrapServer().catch((err: unknown) => {
  logger.fatal({ err }, "❌ Server failed to start");
  process.exit(1);
});
