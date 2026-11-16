import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import type {
  CreateDocumentData,
  DocumentRepository,
  NewChunk,
} from "../repositories/document.repository.js";
import { chunkText } from "../utils/chunkText.js";
import { buildChunks, DocumentService } from "./document.service.js";
import type { EmbeddingService } from "./embedding.service.js";
import { parsePdfInfo, type OcrResult, type OcrService } from "./ocr.service.js";
import type { ProjectService } from "./project.service.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const file = (buffer: Buffer) => ({
  originalname: "স্ক্যান.png",
  mimetype: "image/png",
  size: buffer.length,
  buffer,
});

const imageResult = (text: string): OcrResult => ({
  kind: "image",
  pages: 1,
  totalPages: 1,
  truncated: false,
  text,
  pageTexts: [text],
});

interface Fakes {
  ocr?: () => Promise<OcrResult>;
  embed?: (texts: string[]) => Promise<number[][]>;
  projectExists?: boolean;
}

const setup = ({
  ocr = () => Promise.resolve(imageResult("বাংলা")),
  embed = (texts) => Promise.resolve(texts.map(() => [1, 0])),
  projectExists = true,
}: Fakes = {}) => {
  const saved: { data: CreateDocumentData; chunks: NewChunk[] | null }[] = [];
  const projectService = {
    get: () =>
      projectExists
        ? Promise.resolve({})
        : Promise.reject(new HttpError("Project not found", StatusCodes.NOT_FOUND)),
  } as unknown as ProjectService;
  const row = (data: CreateDocumentData) => ({ ...data, id: "1", created_at: new Date() });
  const repo = {
    create: (data: CreateDocumentData) => {
      saved.push({ data, chunks: null });
      return Promise.resolve(row(data));
    },
    createWithChunks: (data: CreateDocumentData, chunks: NewChunk[]) => {
      saved.push({ data, chunks });
      return Promise.resolve(row(data));
    },
  } as unknown as DocumentRepository;
  const ocrService = { extractText: ocr } as unknown as OcrService;
  const embeddingService = {
    model: "gemini-embedding-001",
    embedDocuments: embed,
  } as unknown as EmbeddingService;
  return {
    saved,
    service: new DocumentService(projectService, repo, ocrService, embeddingService),
  };
};

describe("DocumentService.ocrUpload", () => {
  it("embeds the text, saves it as chunks and returns metadata without the text", async () => {
    const { saved, service } = setup();

    const result = await service.ocrUpload("7", "5", file(PNG));

    assert.equal(saved.length, 1);
    const [{ data, chunks }] = saved;
    assert.equal(data.ocr_status, "completed");
    assert.equal(data.chunk_count, 1);
    assert.equal(data.embedding_model, "gemini-embedding-001");
    assert.equal(data.file_name, "স্ক্যান.png");
    assert.deepEqual(chunks, [
      { chunkIndex: 0, pageNumber: null, content: "বাংলা", embedding: [1, 0] },
    ]);
    assert.equal("text" in result, false);
    assert.equal(result.document.chunkCount, 1);
  });

  it("records a failed OCR without chunks and still returns the error", async () => {
    const failure = new HttpError("Could not read text", StatusCodes.UNPROCESSABLE_ENTITY);
    const { saved, service } = setup({ ocr: () => Promise.reject(failure) });

    const err = await service.ocrUpload("7", "5", file(PNG)).catch((e: unknown) => e);

    assert.equal(err, failure);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].chunks, null);
    assert.equal(saved[0].data.ocr_status, "failed");
    assert.equal(saved[0].data.ocr_error, "Could not read text");
  });

  it("records a failed embedding without chunks and still returns the error", async () => {
    const failure = new HttpError("Gemini down", StatusCodes.BAD_GATEWAY);
    const { saved, service } = setup({ embed: () => Promise.reject(failure) });

    const err = await service.ocrUpload("7", "5", file(PNG)).catch((e: unknown) => e);

    assert.equal(err, failure);
    assert.equal(saved[0].chunks, null);
    assert.equal(saved[0].data.ocr_status, "failed");
    assert.equal(saved[0].data.ocr_error, "Embedding failed: Gemini down");
    assert.equal(saved[0].data.text_length, 5);
  });

  it("does not call Gemini when the file has no text", async () => {
    const { saved, service } = setup({
      ocr: () => Promise.resolve(imageResult("")),
      embed: () => assert.fail("embedding should not run"),
    });

    await service.ocrUpload("7", "5", file(PNG));
    assert.equal(saved[0].data.chunk_count, 0);
    assert.deepEqual(saved[0].chunks, []);
  });

  it("saves nothing for an unsupported file or someone else's project", async () => {
    const never = () => assert.fail("OCR should not run");
    for (const [buffer, projectExists, status] of [
      [Buffer.from("not an image"), true, StatusCodes.UNSUPPORTED_MEDIA_TYPE],
      [PNG, false, StatusCodes.NOT_FOUND],
    ] as const) {
      const { saved, service } = setup({ ocr: never, projectExists });
      const err = await service.ocrUpload("7", "5", file(buffer)).catch((e: unknown) => e);
      assert.ok(err instanceof HttpError);
      assert.equal(err.statusCode, status);
      assert.equal(saved.length, 0);
    }
  });
});

describe("buildChunks", () => {
  it("numbers chunks across pages and keeps each chunk's PDF page", () => {
    const chunks = buildChunks({ kind: "pdf", pageTexts: ["প্রথম পাতা", "", "তৃতীয় পাতা"] });
    assert.deepEqual(chunks, [
      { chunkIndex: 0, pageNumber: 1, content: "প্রথম পাতা" },
      { chunkIndex: 1, pageNumber: 3, content: "তৃতীয় পাতা" },
    ]);
  });
});

describe("chunkText", () => {
  it("keeps short text as one chunk and drops empty text", () => {
    assert.deepEqual(chunkText("আমার সোনার বাংলা।"), ["আমার সোনার বাংলা।"]);
    assert.deepEqual(chunkText("  \n "), []);
  });

  it("splits long text at sentence ends with overlap, within the size limit", () => {
    const sentence = "আমি তোমায় ভালোবাসি।";
    const text = Array.from({ length: 200 }, () => sentence).join(" ");
    const chunks = chunkText(text, { maxChars: 300, overlap: 50 });

    assert.ok(chunks.length > 1);
    for (const chunk of chunks) assert.ok(chunk.length <= 300, `chunk too long: ${chunk.length}`);
    assert.ok(chunks.slice(0, -1).every((c) => c.endsWith("।")));
    for (let i = 1; i < chunks.length; i++) {
      const firstWords = chunks[i].split(" ").slice(0, 2).join(" ");
      assert.ok(chunks[i - 1].includes(firstWords), `chunk ${i} has no overlap`);
    }
  });

  it("hard-splits a single sentence longer than the limit", () => {
    const chunks = chunkText("ক".repeat(2500), { maxChars: 1000, overlap: 150 });
    assert.ok(chunks.length >= 3);
    for (const chunk of chunks) assert.ok(chunk.length <= 1000);
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
