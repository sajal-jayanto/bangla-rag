import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { requireUser } from "../middlewares/auth.middleware.js";
import type { SearchService } from "../services/search.service.js";
import type { SearchBody } from "../validators/search.validator.js";

export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** Answers a (Bangla) question from the project's documents, or "জানা নেই". */
  search = async (req: Request<Record<string, string>, unknown, SearchBody>, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const { query, limit } = req.body;
    const result = await this.searchService.search(ownerId, req.params.id, query, limit);
    req.log.info(
      { projectId: req.params.id, found: result.found, sources: result.sources.length },
      "Search complete",
    );
    res.status(StatusCodes.OK).json(result);
  };
}
