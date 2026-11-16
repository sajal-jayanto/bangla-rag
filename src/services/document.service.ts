import { createHash } from "node:crypto";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import { toDocumentMetadata, type DocumentMetadata } from "../models/document.model.js";
import type {
  CreateDocumentData,
  DocumentRepository,
  NewChunk,
} from "../repositories/document.repository.js";
import { chunkText } from "../utils/chunkText.js";
import type { EmbeddingService } from "./embedding.service.js";
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
  /** True when the PDF had more pages than were OCR'd. */
  truncated: boolean;
}

const MAX_FILE_NAME_LENGTH = 255;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Chunks each page separately so every chunk keeps the page it came from. */
export const buildChunks = (
  ocr: Pick<OcrResult, "kind" | "pageTexts">,
): Omit<NewChunk, "embedding">[] =>
  ocr.pageTexts
    .flatMap((pageText, i) =>
      chunkText(pageText).map((content) => ({
        pageNumber: ocr.kind === "pdf" ? i + 1 : null,
        content,
      })),
    )
    .map((chunk, chunkIndex) => ({ ...chunk, chunkIndex }));

export class DocumentService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly documentRepository: DocumentRepository,
    private readonly ocrService: OcrService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * OCRs an uploaded file, splits the text into chunks, embeds them with Gemini and saves the
   * document metadata and chunks together. The file itself is not stored.
   * If OCR or embedding fails, the document is still recorded with `ocr_status = 'failed'` (and
   * no chunks) before the error is returned to the client.
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

    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const base: CreateDocumentData = {
      project_id: projectId,
      uploaded_by: ownerId,
      file_name: file.originalname.slice(0, MAX_FILE_NAME_LENGTH) || "untitled",
      mime_type: file.mimetype,
      size_bytes: file.size,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
      kind,
      page_count: null,
      pages_processed: null,
      text_length: null,
      pdf_info: null,
      ocr_status: "failed",
      ocr_error: null,
      ocr_duration_ms: 0,
      chunk_count: null,
      embedding_model: null,
    };

    let ocr: OcrResult;
    try {
      ocr = await this.ocrService.extractText(file.buffer);
    } catch (err) {
      await this.documentRepository.create({
        ...base,
        ocr_error: errorMessage(err),
        ocr_duration_ms: elapsed(),
      });
      throw err;
    }

    const ocrFields = {
      page_count: ocr.totalPages,
      pages_processed: ocr.pages,
      text_length: ocr.text.length,
      pdf_info: ocr.pdfInfo ?? null,
    };
    const pieces = buildChunks(ocr);

    let embeddings: number[][];
    try {
      embeddings =
        pieces.length > 0
          ? await this.embeddingService.embedDocuments(pieces.map((p) => p.content))
          : [];
    } catch (err) {
      await this.documentRepository.create({
        ...base,
        ...ocrFields,
        ocr_error: `Embedding failed: ${errorMessage(err)}`,
        ocr_duration_ms: elapsed(),
      });
      throw err;
    }

    const row = await this.documentRepository.createWithChunks(
      {
        ...base,
        ...ocrFields,
        ocr_status: "completed",
        ocr_duration_ms: elapsed(),
        chunk_count: pieces.length,
        embedding_model: this.embeddingService.model,
      },
      pieces.map((piece, i) => ({ ...piece, embedding: embeddings[i] })),
    );
    return { document: toDocumentMetadata(row), truncated: ocr.truncated };
  }

  async listByProject(ownerId: string, projectId: string): Promise<DocumentMetadata[]> {
    await this.projectService.get(ownerId, projectId);
    const rows = await this.documentRepository.findAllByProject(projectId);
    return rows.map(toDocumentMetadata);
  }
}
