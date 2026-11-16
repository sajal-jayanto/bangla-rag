-- Migration: 002_create_projects.sql
-- Runs once inside a transaction. Never edit this file after it has been applied.

CREATE TABLE projects (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  slug        VARCHAR(160) NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'planning'
              CHECK (status IN ('planning', 'active', 'completed', 'archived')),
  priority    TEXT NOT NULL DEFAULT 'mid'
              CHECK (priority IN ('low', 'mid', 'high')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- A slug is unique per owner among live projects, so a soft-deleted project frees its slug.
CREATE UNIQUE INDEX projects_owner_slug_key ON projects (owner_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX projects_owner_created_idx ON projects (owner_id, created_at DESC) WHERE deleted_at IS NULL;
