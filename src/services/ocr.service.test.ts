import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";
import { detectFileKind, OcrService } from "./ocr.service.js";

describe("detectFileKind", () => {
  it("recognises PDFs and images by their leading bytes", () => {
    assert.equal(detectFileKind(Buffer.from("%PDF-1.7\n...")), "pdf");
    assert.equal(detectFileKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), "image");
    assert.equal(detectFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image");
  });

  it("rejects image formats other than PNG and JPEG", () => {
    assert.equal(detectFileKind(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), null);
    assert.equal(detectFileKind(Buffer.from([0x49, 0x49, 0x2a, 0x00])), null);
    assert.equal(detectFileKind(Buffer.from([0x42, 0x4d, 0x00, 0x00])), null);
    assert.equal(detectFileKind(Buffer.from("GIF89a")), null);
  });

  it("rejects anything else, including text renamed to .png", () => {
    assert.equal(detectFileKind(Buffer.from("not an image")), null);
    assert.equal(detectFileKind(Buffer.alloc(0)), null);
  });
});

describe("OcrService", () => {
  it("answers 415 for an unsupported file without running tesseract", async () => {
    const err = await new OcrService().extractText(Buffer.from("hello")).catch((e: unknown) => e);
    assert.ok(err instanceof HttpError);
    assert.equal(err.statusCode, StatusCodes.UNSUPPORTED_MEDIA_TYPE);
  });
});
