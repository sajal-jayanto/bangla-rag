-- Migration: 003_replace_projects_deleted_at_with_is_deleted.sql
-- Runs once inside a transaction. Never edit this file after it has been applied.

ALTER TABLE projects ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT false;
UPDATE projects SET is_deleted = true WHERE deleted_at IS NOT NULL;

-- Dropping the column also drops the two partial indexes that filtered on it.
ALTER TABLE projects DROP COLUMN deleted_at;

CREATE UNIQUE INDEX projects_owner_slug_key ON projects (owner_id, slug) WHERE NOT is_deleted;
CREATE INDEX projects_owner_created_idx ON projects (owner_id, created_at DESC) WHERE NOT is_deleted;
