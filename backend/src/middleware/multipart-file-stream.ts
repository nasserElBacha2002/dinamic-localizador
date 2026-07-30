import Busboy from "busboy";
import type { NextFunction, Request, Response } from "express";
import type { Readable } from "node:stream";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";

export type MultipartFileStream = {
  fieldName: string;
  fileName: string;
  mimeType: string;
  stream: Readable;
};

declare module "express-serve-static-core" {
  interface Request {
    fileStream?: MultipartFileStream;
    multipartFields?: Record<string, string>;
  }
}

/**
 * Parse multipart/form-data and expose a single file as a Readable stream (no full buffer).
 * Idempotency-Key must be sent as a header (fields may arrive after the file).
 */
export const acceptSingleMultipartFileStream = (fieldName = "file") => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.toLowerCase().includes("multipart/form-data")) {
      next(
        new AppError(
          400,
          "ATTACHMENT_MULTIPART_REQUIRED",
          "Se requiere multipart/form-data con un archivo",
        ),
      );
      return;
    }

    let settled = false;
    const fields: Record<string, string> = {};
    const bb = Busboy({
      headers: req.headers as Record<string, string>,
      limits: {
        files: 1,
        fileSize: env.GCS_MAX_FILE_SIZE_BYTES,
      },
    });

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      next(error instanceof Error ? error : new Error(String(error)));
    };

    bb.on("file", (name, stream, info) => {
      if (name !== fieldName) {
        stream.resume();
        return;
      }
      if (req.fileStream) {
        stream.resume();
        return;
      }
      stream.on("limit", () => {
        stream.destroy(
          new AppError(
            413,
            "ATTACHMENT_TOO_LARGE",
            `El archivo supera el máximo de ${env.GCS_MAX_FILE_SIZE_BYTES} bytes`,
          ),
        );
      });
      req.fileStream = {
        fieldName: name,
        fileName: info.filename || "file",
        mimeType: info.mimeType || "application/octet-stream",
        stream,
      };
      req.multipartFields = fields;
      if (!settled) {
        settled = true;
        next();
      }
    });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });

    bb.on("error", fail);

    bb.on("finish", () => {
      if (!settled) {
        settled = true;
        next(
          new AppError(400, "ATTACHMENT_FILE_REQUIRED", "Debe enviar un archivo"),
        );
      }
    });

    req.on("aborted", () => {
      try {
        req.fileStream?.stream.destroy(
          new AppError(499, "CLIENT_ABORTED", "Cliente desconectado durante la subida"),
        );
      } catch {
        /* ignore */
      }
    });

    req.pipe(bb);
  };
};
