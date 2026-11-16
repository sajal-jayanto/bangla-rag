-- Migration: 004_create_documents.sql
-- Runs once inside a transaction. Never edit this file after it has been applied.

-- Metadata of files uploaded to a project for OCR. The file itself and its text are not stored.
CREATE TABLE documents (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id      BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name       VARCHAR(255) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  size_bytes      INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256          CHAR(64) NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('pdf', 'image')),
  page_count      INTEGER,
  pages_processed INTEGER,
  text_length     INTEGER,
  pdf_info        JSONB,
  ocr_status      TEXT NOT NULL CHECK (ocr_status IN ('completed', 'failed')),
  ocr_error       TEXT,
  ocr_duration_ms INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_project_created_idx ON documents (project_id, created_at DESC);
