import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type {
  CreateDocumentData,
  DocumentRepository,
} from "../repositories/document.repository.js";
import { DocumentService } from "./document.service.js";
import { parsePdfInfo, type OcrResult, type OcrService } from "./ocr.service.js";
import type { ProjectService } from "./project.service.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const file = (buffer: Buffer) => ({
  originalname: "স্ক্যান.png",
  mimetype: "image/png",
  size: buffer.length,
  buffer,
});

const setup = (ocr: () => Promise<OcrResult>, projectExists = true) => {
  const saved: CreateDocumentData[] = [];
  const projectService = {
    get: () =>
      projectExists
        ? Promise.resolve({})
        : Promise.reject(new HttpError("Project not found", StatusCodes.NOT_FOUND)),
  } as unknown as ProjectService;
  const repo = {
    create: (data: CreateDocumentData) => {
      saved.push(data);
      return Promise.resolve({ ...data, id: "1", created_at: new Date() });
    },
  } as unknown as DocumentRepository;
  const ocrService = { extractText: ocr } as unknown as OcrService;
  return { saved, service: new DocumentService(projectService, repo, ocrService) };
};

describe("DocumentService.ocrUpload", () => {
  it("saves metadata only (no text) and returns the text", async () => {
    const { saved, service } = setup(() =>
      Promise.resolve({ kind: "image", pages: 1, totalPages: 1, truncated: false, text: "বাংলা" }),
    );

    const { document, ocr } = await service.ocrUpload("7", "5", file(PNG));

    assert.equal(saved.length, 1);
    assert.equal("text" in saved[0], false);
    assert.equal(saved[0].text_length, 5);
    assert.equal(saved[0].ocr_status, "completed");
    assert.equal(saved[0].file_name, "স্ক্যান.png");
    assert.equal(saved[0].sha256.length, 64);
    assert.equal(document.projectId, "5");
    assert.equal(ocr.text, "বাংলা");
  });

  it("records a failed OCR and still returns the error", async () => {
    const failure = new HttpError("Could not read text", StatusCodes.UNPROCESSABLE_ENTITY);
    const { saved, service } = setup(() => Promise.reject(failure));

    const err = await service.ocrUpload("7", "5", file(PNG)).catch((e: unknown) => e);

    assert.equal(err, failure);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].ocr_status, "failed");
    assert.equal(saved[0].ocr_error, "Could not read text");
  });

  it("saves nothing for an unsupported file or someone else's project", async () => {
    const ok = () => assert.fail("OCR should not run");
    for (const [buffer, exists, status] of [
      [Buffer.from("not an image"), true, StatusCodes.UNSUPPORTED_MEDIA_TYPE],
      [PNG, false, StatusCodes.NOT_FOUND],
    ] as const) {
      const { saved, service } = setup(ok, exists);
      const err = await service.ocrUpload("7", "5", file(buffer)).catch((e: unknown) => e);
      assert.ok(err instanceof HttpError);
      assert.equal(err.statusCode, status);
      assert.equal(saved.length, 0);
    }
  });
});

describe("parsePdfInfo", () => {
  it("keeps the known fields that have a value", () => {
    const info = parsePdfInfo(
      [
        "Title:           বার্ষিক প্রতিবেদন",
        "Author:          ",
        "Producer:        GPL Ghostscript 10.05",
        "CreationDate:    2026-11-16T14:36:00+06",
        "Pages:           2",
        "Page size:       595 x 842 pts (A4)",
      ].join("\n"),
    );
    assert.deepEqual(info, {
      title: "বার্ষিক প্রতিবেদন",
      producer: "GPL Ghostscript 10.05",
      creationDate: "2026-11-16T14:36:00+06",
      pageSize: "595 x 842 pts (A4)",
    });
  });
});
