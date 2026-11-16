/* eslint-disable no-console -- standalone CLI that prints to the terminal; avoids loading env/logger */
// Usage: npm run migrate:create -- <name>
// Creates migrations/<next number>_<name>.sql, e.g. 002_add_tags.sql.
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.resolve(import.meta.dirname, "..", "..", "migrations");

const name = process.argv
  .slice(2)
  .join("_")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

if (!name) {
  console.error("Usage: npm run migrate:create -- <name>   (e.g. add_tags)");
  process.exit(1);
}

const files = await readdir(migrationsDir);
const last = Math.max(0, ...files.map((f) => Number.parseInt(f, 10)).filter(Number.isInteger));
const file = `${String(last + 1).padStart(3, "0")}_${name}.sql`;

await writeFile(
  path.join(migrationsDir, file),
  `-- Migration: ${file}\n-- Runs once inside a transaction. Never edit this file after it has been applied.\n\n`,
  { flag: "wx" },
);
console.log(`Created migrations/${file}`);
