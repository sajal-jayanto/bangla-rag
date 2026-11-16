import { z } from "zod";

import { PROJECT_PRIORITIES, PROJECT_STATUSES } from "../models/project.model.js";

const nameField = z
  .string({ error: "Name is required" })
  .trim()
  .min(1, "Name is required")
  .max(150, "Name cannot exceed 150 characters");

// An empty or null description is stored as NULL.
const descriptionField = z
  .string({ error: "Description must be a string or null" })
  .trim()
  .max(5000, "Description cannot exceed 5000 characters")
  .nullable()
  .transform((value) => (value ? value : null));

const statusField = z.enum(PROJECT_STATUSES, {
  error: `Status must be one of: ${PROJECT_STATUSES.join(", ")}`,
});

const priorityField = z.enum(PROJECT_PRIORITIES, {
  error: `Priority must be one of: ${PROJECT_PRIORITIES.join(", ")}`,
});

// Strict objects reject fields the user may not set (slug, ownerId, timestamps, ...).
export const createProjectSchema = z.strictObject({
  name: nameField,
  description: descriptionField.optional(),
  status: statusField.optional(),
  priority: priorityField.optional(),
});

export const updateProjectSchema = z
  .strictObject({
    name: nameField.optional(),
    description: descriptionField.optional(),
    status: statusField.optional(),
    priority: priorityField.optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: "Provide at least one of: name, description, status, priority",
    path: ["body"],
  });

export const projectIdParamsSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,17}$/, "Project id must be a positive integer"),
});

export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
