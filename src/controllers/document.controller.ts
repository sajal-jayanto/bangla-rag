import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { requireUser } from "../middlewares/auth.middleware.js";
import type { DocumentService } from "../services/document.service.js";

type ProjectRequest = Request<Record<string, string>>;

export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  ocr = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const file = req.file;
    if (!file) throw new Error("uploadSingleFile must run before DocumentController.ocr");

    const { document, truncated } = await this.documentService.ocrUpload(
      ownerId,
      req.params.id,
      file,
    );
    req.log.info(
      {
        projectId: document.projectId,
        documentId: document.id,
        pages: document.pagesProcessed,
        chars: document.textLength,
        chunks: document.chunkCount,
      },
      "Document processed",
    );

    res.status(StatusCodes.CREATED).json({ document, truncated });
  };

  list = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const documents = await this.documentService.listByProject(ownerId, req.params.id);
    res.status(StatusCodes.OK).json({ documents });
  };
}
