import { createHash } from "node:crypto";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import { toDocumentMetadata, type DocumentMetadata } from "../models/document.model.js";
import type { DocumentRepository } from "../repositories/document.repository.js";
import {
  detectFileKind,
  UNSUPPORTED_FILE_MESSAGE,
  type OcrResult,
  type OcrService,
} from "./ocr.service.js";
import type { ProjectService } from "./project.service.js";

/** The parts of an uploaded file this service needs (a subset of multer's `File`). */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface OcrUploadResult {
  document: DocumentMetadata;
  ocr: OcrResult;
}

const MAX_FILE_NAME_LENGTH = 255;

export class DocumentService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly documentRepository: DocumentRepository,
    private readonly ocrService: OcrService,
  ) {}

  /**
   * OCRs an uploaded file and saves only its metadata. The file and the text are not stored.
   * A file whose OCR fails is still recorded, with `ocr_status = 'failed'`, before the error is
   * returned to the client.
   */
  async ocrUpload(
    ownerId: string,
    projectId: string,
    file: UploadedFile,
  ): Promise<OcrUploadResult> {
    // 404 unless the project exists, is not deleted and belongs to the user.
    await this.projectService.get(ownerId, projectId);

    const kind = detectFileKind(file.buffer);
    if (!kind) {
      throw new HttpError(UNSUPPORTED_FILE_MESSAGE, StatusCodes.UNSUPPORTED_MEDIA_TYPE);
    }

    const base = {
      project_id: projectId,
      uploaded_by: ownerId,
      file_name: file.originalname.slice(0, MAX_FILE_NAME_LENGTH) || "untitled",
      mime_type: file.mimetype,
      size_bytes: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      kind,
    };

    const started = performance.now();
    let ocr: OcrResult;
    try {
      ocr = await this.ocrService.extractText(file.buffer);
    } catch (err) {
      await this.documentRepository.create({
        ...base,
        page_count: null,
        pages_processed: null,
        text_length: null,
        pdf_info: null,
        ocr_status: "failed",
        ocr_error: err instanceof Error ? err.message : String(err),
        ocr_duration_ms: Math.round(performance.now() - started),
      });
      throw err;
    }

    const row = await this.documentRepository.create({
      ...base,
      page_count: ocr.totalPages,
      pages_processed: ocr.pages,
      text_length: ocr.text.length,
      pdf_info: ocr.pdfInfo ?? null,
      ocr_status: "completed",
      ocr_error: null,
      ocr_duration_ms: Math.round(performance.now() - started),
    });
    return { document: toDocumentMetadata(row), ocr };
  }

  async listByProject(ownerId: string, projectId: string): Promise<DocumentMetadata[]> {
    await this.projectService.get(ownerId, projectId);
    const rows = await this.documentRepository.findAllByProject(projectId);
    return rows.map(toDocumentMetadata);
  }

  async get(ownerId: string, projectId: string, documentId: string): Promise<DocumentMetadata> {
    await this.projectService.get(ownerId, projectId);
    const row = await this.documentRepository.findById(projectId, documentId);
    if (!row) throw new HttpError("Document not found", StatusCodes.NOT_FOUND);
    return toDocumentMetadata(row);
  }
}
