-- Migration: 005_create_chunks.sql
-- Runs once inside a transaction. Never edit this file after it has been applied.

-- OCR text split into chunks, each with a Gemini embedding (gemini-embedding-001, 768 dimensions).
-- The dimension must match EMBEDDING_DIMENSIONS in src/services/embedding.service.ts.
CREATE TABLE chunks (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  content     TEXT NOT NULL,
  embedding   vector(768) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX chunks_project_id_idx ON chunks (project_id);
CREATE INDEX chunks_embedding_hnsw_idx ON chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE documents
  ADD COLUMN chunk_count     INTEGER,
  ADD COLUMN embedding_model TEXT;
