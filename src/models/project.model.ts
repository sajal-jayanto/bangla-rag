export const PROJECT_STATUSES = ["planning", "active", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ["low", "mid", "high"] as const;
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number];

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  createdAt: Date;
}

export const toProject = (row: ProjectRow): Project => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  status: row.status,
  priority: row.priority,
  createdAt: row.created_at,
});
