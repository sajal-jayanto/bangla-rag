import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import { toProject, type Project } from "../models/project.model.js";
import { SlugTakenError, type ProjectRepository } from "../repositories/project.repository.js";
import { slugify } from "../utils/slugify.js";
import type { CreateProjectBody, UpdateProjectBody } from "../validators/project.validator.js";

// Retries cover the race where two requests pick the same free slug at the same time.
const SLUG_ATTEMPTS = 3;

const notFound = () => new HttpError("Project not found", StatusCodes.NOT_FOUND);

/** `base` if it is free, otherwise `base-N` with the smallest free N ≥ 2. */
export const nextFreeSlug = (base: string, taken: readonly string[]): string => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

export class ProjectService {
  constructor(private readonly projectRepository: ProjectRepository) {}

  // The slug is derived from the name on create and stays fixed afterwards.
  async create(ownerId: string, body: CreateProjectBody): Promise<Project> {
    const base = slugify(body.name);
    for (let attempt = 1; ; attempt++) {
      const taken = await this.projectRepository.findSlugsLike(ownerId, base);
      try {
        const row = await this.projectRepository.create({
          ownerId,
          name: body.name,
          slug: nextFreeSlug(base, taken),
          description: body.description ?? null,
          status: body.status,
          priority: body.priority,
        });
        return toProject(row);
      } catch (err) {
        if (!(err instanceof SlugTakenError)) throw err;
        if (attempt >= SLUG_ATTEMPTS) {
          throw new HttpError("Could not create project, please retry", StatusCodes.CONFLICT, {
            cause: err,
          });
        }
      }
    }
  }

  async listByOwner(ownerId: string): Promise<Project[]> {
    const rows = await this.projectRepository.findAllByOwner(ownerId);
    return rows.map(toProject);
  }

  async get(ownerId: string, id: string): Promise<Project> {
    const row = await this.projectRepository.findById(ownerId, id);
    if (!row) throw notFound();
    return toProject(row);
  }

  async update(ownerId: string, id: string, body: UpdateProjectBody): Promise<Project> {
    const row = await this.projectRepository.update(ownerId, id, body);
    if (!row) throw notFound();
    return toProject(row);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.projectRepository.softDelete(ownerId, id);
    if (!deleted) throw notFound();
  }
}
