import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { requireUser } from "../middlewares/auth.middleware.js";
import type { DashboardService } from "../services/dashboard.service.js";

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getMe = async (req: Request, res: Response) => {
    const { id } = requireUser(req);
    const user = await this.dashboardService.getProfile(id);
    res.status(StatusCodes.OK).json({ user });
  };

  getDashboard = async (req: Request, res: Response) => {
    const { id } = requireUser(req);
    const dashboard = await this.dashboardService.getDashboard(id);
    res.status(StatusCodes.OK).json(dashboard);
  };
}
