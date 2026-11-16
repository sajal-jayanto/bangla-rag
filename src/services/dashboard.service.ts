import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import { toPublicUser, type PublicUser } from "../models/user.model.js";
import type { DashboardRepository, DatabaseInfo } from "../repositories/dashboard.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";

export interface Dashboard {
  user: PublicUser;
  database: DatabaseInfo;
}

export class DashboardService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly dashboardRepository: DashboardRepository,
  ) {}

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new HttpError("User not found", StatusCodes.NOT_FOUND);
    }
    return toPublicUser(user);
  }

  async getDashboard(userId: string): Promise<Dashboard> {
    const [user, database] = await Promise.all([
      this.getProfile(userId),
      this.dashboardRepository.getDatabaseInfo(),
    ]);
    return { user, database };
  }
}
