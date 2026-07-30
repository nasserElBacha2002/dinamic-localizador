import { createHash } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import { AppError } from "../../errors/app-error";
import {
  ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES,
  type AbsenceAttachmentAllowedMime,
} from "../../types/absence-attachment";
import { detectMimeFromMagicBytes } from "./file-validation";

const MAGIC_WINDOW = 16;

/**
 * Pass-through transform: enforces max bytes, computes SHA-256, detects MIME from head window.
 * Does not buffer the full file.
 */
export class AttachmentUploadTransform extends Transform {
  private readonly hash = createHash("sha256");
  private readonly head: Buffer[] = [];
  private headBytes = 0;
  private detected: AbsenceAttachmentAllowedMime | null = null;
  private totalBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    super();
    this.maxBytes = maxBytes;
  }

  get sizeBytes(): number {
    return this.totalBytes;
  }

  get checksumSha256(): string {
    return this.hash.copy().digest("hex");
  }

  get detectedContentType(): AbsenceAttachmentAllowedMime {
    if (!this.detected) {
      throw new AppError(
        400,
        "ATTACHMENT_TYPE_UNRECOGNIZED",
        "No se pudo verificar el tipo real del archivo",
      );
    }
    return this.detected;
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (this.totalBytes + buf.length > this.maxBytes) {
        callback(
          new AppError(
            413,
            "ATTACHMENT_TOO_LARGE",
            `El archivo supera el máximo de ${this.maxBytes} bytes`,
          ),
        );
        return;
      }

      if (this.headBytes < MAGIC_WINDOW) {
        const need = MAGIC_WINDOW - this.headBytes;
        this.head.push(buf.subarray(0, Math.min(need, buf.length)));
        this.headBytes += Math.min(need, buf.length);
        if (this.headBytes >= MAGIC_WINDOW && !this.detected) {
          const headBuf = Buffer.concat(this.head);
          this.detected = detectMimeFromMagicBytes(headBuf);
          if (
            !this.detected ||
            !ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(this.detected)
          ) {
            callback(
              new AppError(
                400,
                "ATTACHMENT_TYPE_UNRECOGNIZED",
                "No se pudo verificar el tipo real del archivo",
              ),
            );
            return;
          }
        }
      }

      this.totalBytes += buf.length;
      this.hash.update(buf);
      this.push(buf);
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  override _flush(callback: TransformCallback): void {
    try {
      if (this.totalBytes === 0) {
        callback(new AppError(400, "ATTACHMENT_EMPTY", "El archivo está vacío"));
        return;
      }
      if (!this.detected) {
        const headBuf = Buffer.concat(this.head);
        this.detected = detectMimeFromMagicBytes(headBuf);
        if (
          !this.detected ||
          !ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(this.detected)
        ) {
          callback(
            new AppError(
              400,
              "ATTACHMENT_TYPE_UNRECOGNIZED",
              "No se pudo verificar el tipo real del archivo",
            ),
          );
          return;
        }
      }
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
