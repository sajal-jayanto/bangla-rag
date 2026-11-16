import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { StatusCodes } from "http-status-codes";

import { env } from "../config/env.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { toPublicUser, type PublicUser, type UserRow } from "../models/user.model.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { LoginBody, RegisterBody } from "../validators/auth.validator.js";

export interface AuthResult {
  user: PublicUser;
  token: string;
}

const SALTROUND = 12;

export class AuthService {
  constructor(private readonly userRepository: UserRepository) {}

  async register({ name, email, password }: RegisterBody): Promise<AuthResult> {
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new HttpError("Email is already registered", StatusCodes.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(password, SALTROUND);
    const createdUser = await this.userRepository.create({ name, email, passwordHash });
    return this.buildAuthResult(createdUser);
  }

  async login({ email, password }: LoginBody): Promise<AuthResult> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new HttpError(`No user found with email ${email}`, StatusCodes.NOT_FOUND);
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      throw new HttpError("Invalid password", StatusCodes.UNAUTHORIZED);
    }

    return this.buildAuthResult(user);
  }

  private buildAuthResult(user: UserRow): AuthResult {
    return { user: toPublicUser(user), token: this.signToken(user) };
  }

  private signToken(user: UserRow): string {
    return jwt.sign({ sub: user.id, role: user.role }, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn as SignOptions["expiresIn"],
      algorithm: "HS256",
    });
  }
}
