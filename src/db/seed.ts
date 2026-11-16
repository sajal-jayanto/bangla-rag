// Usage: npm run seed
// Adds a demo user and sample projects for local development. Safe to run again: the user is
// reused and only projects whose slug the demo user doesn't have yet are inserted.
import bcrypt from "bcryptjs";

import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import type { ProjectPriority, ProjectStatus } from "../models/project.model.js";
import { slugify } from "../utils/slugify.js";
import { runMigrations } from "./migrate.js";
import { pool } from "./pool.js";

const DEMO_USER = { name: "Demo User", email: "demo@example.com", password: "password123" };

interface SeedProject {
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  deleted?: boolean;
}

const PROJECTS: SeedProject[] = [
  {
    name: "Bangla News Search",
    description: "Semantic search over Bangla news articles using pgvector embeddings.",
    status: "active",
    priority: "high",
  },
  {
    name: "বাংলা প্রশ্নোত্তর চ্যাটবট",
    description: "RAG chatbot that answers questions from Bangla textbooks.",
    status: "planning",
    priority: "high",
  },
  {
    name: "Tokenizer Benchmark",
    description: "Compare tokenizers on Bangla text for chunking quality and token count.",
    status: "active",
    priority: "mid",
  },
  {
    name: "Legal Docs Assistant",
    description: "Retrieve and summarise clauses from Bangladeshi legal documents.",
    status: "planning",
    priority: "mid",
  },
  {
    name: "Embedding Model Evaluation",
    description: "Evaluate multilingual embedding models on a Bangla retrieval set.",
    status: "completed",
    priority: "high",
  },
  {
    name: "কৃষি তথ্য সহায়ক",
    description: "Answer farmers' questions from agriculture extension guides.",
    status: "active",
    priority: "low",
  },
  {
    name: "Old OCR Pipeline",
    description: "First attempt at OCR for scanned Bangla PDFs, replaced by a newer pipeline.",
    status: "archived",
    priority: "low",
  },
  {
    name: "Scratch Experiment",
    description: "Throwaway test project, kept soft-deleted to exercise is_deleted.",
    status: "planning",
    priority: "low",
    deleted: true,
  },
];

const upsertDemoUser = async (): Promise<string> => {
  const passwordHash = await bcrypt.hash(DEMO_USER.password, 12);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT ((lower(email))) DO UPDATE SET updated_at = users.updated_at
     RETURNING id`,
    [DEMO_USER.name, DEMO_USER.email, passwordHash],
  );
  return rows[0].id;
};

const seedProjects = async (ownerId: string): Promise<number> => {
  let inserted = 0;
  for (const project of PROJECTS) {
    // Checks deleted rows too, so the soft-deleted sample is not re-added on every run.
    const { rowCount } = await pool.query(
      `INSERT INTO projects (owner_id, name, slug, description, status, priority, is_deleted)
       SELECT $1::bigint, $2::varchar, $3::varchar, $4::text, $5::text, $6::text,
              $7::boolean
       WHERE NOT EXISTS (SELECT 1 FROM projects WHERE owner_id = $1::bigint AND slug = $3::varchar)`,
      [
        ownerId,
        project.name,
        slugify(project.name),
        project.description,
        project.status,
        project.priority,
        project.deleted ?? false,
      ],
    );
    inserted += rowCount ?? 0;
  }
  return inserted;
};

if (env.nodeEnv === "production") {
  logger.fatal("❌ Refusing to seed a production database");
  process.exit(1);
}

try {
  await runMigrations(pool);
  const ownerId = await upsertDemoUser();
  const inserted = await seedProjects(ownerId);
  logger.info(
    `🌱 Seeded ${inserted} new project(s) for ${DEMO_USER.email} / ${DEMO_USER.password} (user id ${ownerId})`,
  );
} catch (err) {
  logger.fatal({ err }, "❌ Seeding failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
