import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { requireUser } from "../middlewares/auth.middleware.js";
import type { ProjectService } from "../services/project.service.js";
import type { CreateProjectBody, UpdateProjectBody } from "../validators/project.validator.js";

type ProjectRequest<Body = unknown> = Request<Record<string, string>, unknown, Body>;

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  create = async (req: ProjectRequest<CreateProjectBody>, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const project = await this.projectService.create(ownerId, req.body);
    res.status(StatusCodes.CREATED).json({ project });
  };

  list = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const projects = await this.projectService.listByOwner(ownerId);
    res.status(StatusCodes.OK).json({ projects });
  };

  get = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const project = await this.projectService.get(ownerId, req.params.id);
    res.status(StatusCodes.OK).json({ project });
  };

  update = async (req: ProjectRequest<UpdateProjectBody>, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const project = await this.projectService.update(ownerId, req.params.id, req.body);
    res.status(StatusCodes.OK).json({ project });
  };

  remove = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    await this.projectService.remove(ownerId, req.params.id);
    res.status(StatusCodes.NO_CONTENT).end();
  };
}
