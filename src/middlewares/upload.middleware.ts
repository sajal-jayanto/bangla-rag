import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { StatusCodes } from "http-status-codes";

import { UNSUPPORTED_FILE_MESSAGE } from "../services/ocr.service.js";
import { HttpError } from "./error.middleware.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg", // non-standard, but some clients send it for .jpg
]);

// Kept in memory only: the file is never written to disk by multer and is dropped after the request.
const upload = multer({
  storage: multer.memoryStorage(),
  // Decode filenames as UTF-8 so Bangla names are not garbled (multer defaults to latin1).
  defParamCharset: "utf8",
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new HttpError(UNSUPPORTED_FILE_MESSAGE, StatusCodes.UNSUPPORTED_MEDIA_TYPE));
  },
});

const MULTER_ERRORS: Partial<Record<multer.ErrorCode, [string, number]>> = {
  LIMIT_FILE_SIZE: ["File is too large; the maximum is 5 MB", StatusCodes.REQUEST_TOO_LONG],
  LIMIT_FILE_COUNT: ["Upload a single file", StatusCodes.BAD_REQUEST],
  LIMIT_FIELD_COUNT: ["Only a single `file` field is accepted", StatusCodes.BAD_REQUEST],
  LIMIT_UNEXPECTED_FILE: ["Send the file in a form field named `file`", StatusCodes.BAD_REQUEST],
};

/** Accepts one file in the multipart field `file` (≤ 5 MB) and puts it on `req.file`. */
export const uploadSingleFile = (req: Request, res: Response, next: NextFunction): void => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const [message, status] = MULTER_ERRORS[err.code] ?? [
        "Invalid upload",
        StatusCodes.BAD_REQUEST,
      ];
      return next(new HttpError(message, status, { cause: err }));
    }
    if (err) return next(err);
    if (!req.file) {
      return next(
        new HttpError(
          "Send the file as multipart/form-data in a field named `file`",
          StatusCodes.BAD_REQUEST,
        ),
      );
    }
    next();
  });
};
