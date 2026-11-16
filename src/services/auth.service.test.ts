import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type { UserRow } from "../models/user.model.js";
import type { UserRepository } from "../repositories/user.repository.js";
import { AuthService } from "./auth.service.js";

const makeService = (repo: Partial<UserRepository>) =>
  new AuthService(repo as unknown as UserRepository);

const makeRow = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: "1",
  name: "Rahim",
  email: "rahim@example.com",
  password_hash: bcrypt.hashSync("correct-password", 4),
  role: "user",
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const rejection = (p: Promise<unknown>) =>
  p.then(
    () => assert.fail("expected promise to reject"),
    (e: unknown) => e,
  );

describe("AuthService", () => {
  it("register rejects an email that is already taken with 409", async () => {
    const service = makeService({ findByEmail: () => Promise.resolve(makeRow()) });

    const err = await rejection(
      service.register({ name: "X", email: "rahim@example.com", password: "12345678" }),
    );
    assert.ok(err instanceof HttpError);
    assert.equal(err.statusCode, StatusCodes.CONFLICT);
  });

  it("register hashes the password and returns a public user with a token", async () => {
    let savedHash = "";
    const service = makeService({
      findByEmail: () => Promise.resolve(null),
      create: (data) => {
        savedHash = data.passwordHash;
        return Promise.resolve(makeRow({ password_hash: data.passwordHash }));
      },
    });

    const result = await service.register({
      name: "Rahim",
      email: "rahim@example.com",
      password: "a-new-password",
    });

    assert.ok(await bcrypt.compare("a-new-password", savedHash));
    assert.equal("password_hash" in result.user, false);
    const payload = jwt.decode(result.token) as { sub: string; role: string };
    assert.equal(payload.sub, "1");
    assert.equal(payload.role, "user");
  });

  it("login fails with the same 401 for an unknown email and a wrong password", async () => {
    const unknown = makeService({ findByEmail: () => Promise.resolve(null) });
    const wrongPw = makeService({ findByEmail: () => Promise.resolve(makeRow()) });

    for (const service of [unknown, wrongPw]) {
      const err = await rejection(
        service.login({ email: "rahim@example.com", password: "wrong-password" }),
      );
      assert.ok(err instanceof HttpError);
      assert.equal(err.statusCode, StatusCodes.UNAUTHORIZED);
      assert.equal(err.message, "Invalid email or password");
    }
  });

  it("login succeeds with the correct password", async () => {
    const service = makeService({ findByEmail: () => Promise.resolve(makeRow()) });
    const result = await service.login({
      email: "rahim@example.com",
      password: "correct-password",
    });
    assert.equal(result.user.email, "rahim@example.com");
    assert.ok(result.token);
  });
});
