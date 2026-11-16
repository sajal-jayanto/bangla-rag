import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { requireUser } from "../middlewares/auth.middleware.js";
import type { DocumentService } from "../services/document.service.js";

type ProjectRequest = Request<Record<string, string>>;

export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  /** OCRs the uploaded file, saves its metadata and returns the text. The file is not stored. */
  ocr = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const file = req.file;
    if (!file) throw new Error("uploadSingleFile must run before DocumentController.ocr");

    const { document, ocr } = await this.documentService.ocrUpload(ownerId, req.params.id, file);
    req.log.info(
      {
        projectId: document.projectId,
        documentId: document.id,
        pages: ocr.pages,
        chars: ocr.text.length,
      },
      "OCR complete",
    );
    req.log.debug({ text: ocr.text }, "OCR text");

    res.status(StatusCodes.CREATED).json({ document, text: ocr.text, truncated: ocr.truncated });
  };

  list = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const documents = await this.documentService.listByProject(ownerId, req.params.id);
    res.status(StatusCodes.OK).json({ documents });
  };

  get = async (req: ProjectRequest, res: Response) => {
    const { id: ownerId } = requireUser(req);
    const document = await this.documentService.get(ownerId, req.params.id, req.params.documentId);
    res.status(StatusCodes.OK).json({ document });
  };
}
