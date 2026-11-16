import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StatusCodes } from "http-status-codes";

import { HttpError } from "../middlewares/error.middleware.js";

export type OcrFileKind = "pdf" | "image";

export interface OcrResult {
  kind: OcrFileKind;
  pages: number;
  totalPages: number;
  truncated: boolean;
  text: string;
  pageTexts: string[];
  pdfInfo?: PdfInfo;
}

export type PdfInfo = Partial<
  Record<(typeof PDF_INFO_FIELDS)[keyof typeof PDF_INFO_FIELDS], string>
>;

const PDF_INFO_FIELDS = {
  Title: "title",
  Subject: "subject",
  Author: "author",
  Creator: "creator",
  Producer: "producer",
  CreationDate: "creationDate",
  ModDate: "modDate",
  "Page size": "pageSize",
  "PDF version": "pdfVersion",
  Encrypted: "encrypted",
} as const;

export const parsePdfInfo = (output: string): PdfInfo => {
  const info: PdfInfo = {};
  for (const line of output.split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (value && key in PDF_INFO_FIELDS) {
      info[PDF_INFO_FIELDS[key as keyof typeof PDF_INFO_FIELDS]] = value;
    }
  }
  return info;
};

export interface OcrOptions {
  languages: string;
  maxPdfPages: number;
  pdfDpi: number;
  timeoutMs: number;
}

const DEFAULT_OPTIONS: OcrOptions = {
  languages: "ben+eng",
  maxPdfPages: 20,
  pdfDpi: 300,
  timeoutMs: 120_000,
};

export const UNSUPPORTED_FILE_MESSAGE = "Unsupported file: only PDF, PNG and JPG are accepted";

const SIGNATURES: { kind: OcrFileKind; bytes: number[] }[] = [
  { kind: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { kind: "image", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { kind: "image", bytes: [0xff, 0xd8, 0xff] },
];

export const detectFileKind = (buffer: Buffer): OcrFileKind | null => {
  const match = SIGNATURES.find(({ bytes }) => bytes.every((byte, i) => buffer[i] === byte));
  return match?.kind ?? null;
};

class CommandMissingError extends Error {}

const run = (
  command: string,
  args: string[],
  { input, timeoutMs }: { input?: Buffer; timeoutMs: number },
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      timeout: timeoutMs,
      env: { ...process.env, OMP_THREAD_LIMIT: "1" },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(err.code === "ENOENT" ? new CommandMissingError(command, { cause: err }) : err);
    });
    child.on("close", (code, signal) => {
      if (code === 0) return resolve(Buffer.concat(stdout).toString("utf8"));
      const reason = signal ? `killed by ${signal}` : `exit code ${code}`;
      const details = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(`${command} failed (${reason}): ${details}`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });

export class OcrService {
  private readonly options: OcrOptions;

  constructor(options: Partial<OcrOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async extractText(buffer: Buffer): Promise<OcrResult> {
    const kind = detectFileKind(buffer);
    if (!kind) {
      throw new HttpError(UNSUPPORTED_FILE_MESSAGE, StatusCodes.UNSUPPORTED_MEDIA_TYPE);
    }

    try {
      if (kind === "image") {
        const text = await this.ocrImage(buffer);
        return { kind, pages: 1, totalPages: 1, truncated: false, text, pageTexts: [text] };
      }
      return await this.ocrPdf(buffer);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err instanceof CommandMissingError) {
        throw new HttpError(
          `OCR is unavailable: "${err.message}" is not installed on the server`,
          StatusCodes.SERVICE_UNAVAILABLE,
          { cause: err },
        );
      }
      throw new HttpError(
        "Could not read text from the file; it may be corrupt or encrypted",
        StatusCodes.UNPROCESSABLE_ENTITY,
        { cause: err },
      );
    }
  }

  private async ocrImage(input: Buffer | string): Promise<string> {
    const source = typeof input === "string" ? input : "stdin";
    const text = await run("tesseract", [source, "stdout", "-l", this.options.languages], {
      input: typeof input === "string" ? undefined : input,
      timeoutMs: this.options.timeoutMs,
    });
    return text.trim();
  }

  private async ocrPdf(buffer: Buffer): Promise<OcrResult> {
    const { maxPdfPages, pdfDpi, timeoutMs } = this.options;
    const dir = await mkdtemp(path.join(tmpdir(), "bangla-rag-ocr-"));
    try {
      const pdfPath = path.join(dir, "input.pdf");
      await writeFile(pdfPath, buffer);

      const info = await run("pdfinfo", ["-enc", "UTF-8", "-isodates", pdfPath], { timeoutMs });
      const pdfInfo = parsePdfInfo(info);
      const totalPages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1] ?? 0);
      const pages = Math.min(totalPages, maxPdfPages);
      if (pages === 0) {
        return {
          kind: "pdf",
          pages: 0,
          totalPages,
          truncated: false,
          text: "",
          pageTexts: [],
          pdfInfo,
        };
      }

      await run(
        "pdftoppm",
        [
          "-r",
          String(pdfDpi),
          "-gray",
          "-png",
          "-f",
          "1",
          "-l",
          String(pages),
          pdfPath,
          path.join(dir, "page"),
        ],
        { timeoutMs },
      );
      const images = (await readdir(dir))
        .filter((f) => f.startsWith("page") && f.endsWith(".png"))
        .sort();

      const texts: string[] = [];
      for (const image of images) {
        texts.push(await this.ocrImage(path.join(dir, image)));
      }
      return {
        kind: "pdf",
        pages: images.length,
        totalPages,
        truncated: totalPages > pages,
        text: texts.join("\n\n").trim(),
        pageTexts: texts,
        pdfInfo,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
