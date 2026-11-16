import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { ProjectRow } from "../models/project.model.js";
import {
  SlugTakenError,
  type CreateProjectData,
  type ProjectRepository,
} from "../repositories/project.repository.js";
import { slugify } from "../utils/slugify.js";
import { createProjectSchema, updateProjectSchema } from "../validators/project.validator.js";
import { nextFreeSlug, ProjectService } from "./project.service.js";

const makeService = (repo: Partial<ProjectRepository>) =>
  new ProjectService(repo as unknown as ProjectRepository);

const makeRow = (overrides: Partial<ProjectRow> = {}): ProjectRow => ({
  id: "1",
  owner_id: "7",
  name: "Demo",
  slug: "demo",
  description: null,
  status: "planning",
  priority: "mid",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
  is_deleted: false,
  ...overrides,
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => assert.fail("expected promise to reject"),
    (e: unknown) => e,
  );

describe("slugify", () => {
  it("lowercases and hyphenates Latin text", () => {
    assert.equal(slugify("  My First -- Project! "), "my-first-project");
  });

  it("keeps Bangla letters and vowel signs", () => {
    assert.equal(slugify("আমার প্রকল্প ২০২৬"), "আমার-প্রকল্প-২০২৬");
  });

  it("falls back to 'project' when nothing usable is left", () => {
    assert.equal(slugify("!!!"), "project");
  });
});

describe("nextFreeSlug", () => {
  it("uses the base when it is free, else the smallest free suffix", () => {
    assert.equal(nextFreeSlug("demo", []), "demo");
    assert.equal(nextFreeSlug("demo", ["demo"]), "demo-2");
    assert.equal(nextFreeSlug("demo", ["demo", "demo-2", "demo-4"]), "demo-3");
  });
});

describe("project validators", () => {
  it("reject fields the user may not set", () => {
    assert.equal(createProjectSchema.safeParse({ name: "X", slug: "x" }).success, false);
    assert.equal(updateProjectSchema.safeParse({ ownerId: "2" }).success, false);
    assert.equal(updateProjectSchema.safeParse({ isDeleted: true }).success, false);
  });

  it("reject an empty update and unknown enum values", () => {
    assert.equal(updateProjectSchema.safeParse({}).success, false);
    assert.equal(updateProjectSchema.safeParse({ status: "Done" }).success, false);
    assert.equal(updateProjectSchema.safeParse({ priority: "urgent" }).success, false);
  });

  it("accept a partial update and clear an empty description to null", () => {
    const result = updateProjectSchema.parse({ description: "   ", priority: "high" });
    assert.deepEqual(result, { description: null, priority: "high" });
  });
});

describe("ProjectService", () => {
  it("create derives the slug from the name and skips taken ones", async () => {
    let saved: CreateProjectData | undefined;
    const service = makeService({
      findSlugsLike: () => Promise.resolve(["my-app", "my-app-2"]),
      create: (data) => {
        saved = data;
        return Promise.resolve(makeRow({ name: data.name, slug: data.slug }));
      },
    });

    const project = await service.create("7", { name: "My App" });
    assert.equal(saved?.slug, "my-app-3");
    assert.equal(saved?.ownerId, "7");
    assert.equal(project.slug, "my-app-3");
    assert.equal("isDeleted" in project, false);
  });

  it("create retries when a concurrent request takes the slug first", async () => {
    let calls = 0;
    const service = makeService({
      findSlugsLike: () => Promise.resolve(calls === 0 ? [] : ["demo"]),
      create: (data) => {
        calls++;
        if (calls === 1) return Promise.reject(new SlugTakenError("taken"));
        return Promise.resolve(makeRow({ slug: data.slug }));
      },
    });

    const project = await service.create("7", { name: "Demo" });
    assert.equal(calls, 2);
    assert.equal(project.slug, "demo-2");
  });

  it("get, update and remove return 404 for a missing, foreign or deleted project", async () => {
    const service = makeService({
      findById: () => Promise.resolve(null),
      update: () => Promise.resolve(null),
      softDelete: () => Promise.resolve(false),
    });

    for (const p of [
      service.get("7", "1"),
      service.update("7", "1", { name: "X" }),
      service.remove("7", "1"),
    ]) {
      const err = await rejection(p);
      assert.ok(err instanceof HttpError);
      assert.equal(err.statusCode, StatusCodes.NOT_FOUND);
    }
  });
});
