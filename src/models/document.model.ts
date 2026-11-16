import type { OcrFileKind, PdfInfo } from "../services/ocr.service.js";

export const OCR_STATUSES = ["completed", "failed"] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

/** Metadata of an uploaded file. The file and its OCR text are never stored. */
export interface DocumentRow {
  id: string;
  project_id: string;
  uploaded_by: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  kind: OcrFileKind;
  page_count: number | null;
  pages_processed: number | null;
  text_length: number | null;
  pdf_info: PdfInfo | null;
  ocr_status: OcrStatus;
  ocr_error: string | null;
  ocr_duration_ms: number;
  created_at: Date;
}

export interface DocumentMetadata {
  id: string;
  projectId: string;
  uploadedBy: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  kind: OcrFileKind;
  pageCount: number | null;
  pagesProcessed: number | null;
  textLength: number | null;
  pdfInfo: PdfInfo | null;
  ocrStatus: OcrStatus;
  ocrError: string | null;
  ocrDurationMs: number;
  createdAt: Date;
}

export const toDocumentMetadata = (row: DocumentRow): DocumentMetadata => ({
  id: row.id,
  projectId: row.project_id,
  uploadedBy: row.uploaded_by,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  sha256: row.sha256,
  kind: row.kind,
  pageCount: row.page_count,
  pagesProcessed: row.pages_processed,
  textLength: row.text_length,
  pdfInfo: row.pdf_info,
  ocrStatus: row.ocr_status,
  ocrError: row.ocr_error,
  ocrDurationMs: row.ocr_duration_ms,
  createdAt: row.created_at,
});
