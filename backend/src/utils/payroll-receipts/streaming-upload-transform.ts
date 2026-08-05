import { createHash } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import { AppError } from "../../errors/app-error";
import { detectPdfFromMagicBytes } from "./file-validation";

const MAGIC_WINDOW = 16;

/**
 * Pass-through transform: enforces max bytes, SHA-256, PDF magic-byte check.
 * Does not buffer the full file.
 */
export class PayrollPdfUploadTransform extends Transform {
  private readonly hash = createHash("sha256");
  private readonly head: Buffer[] = [];
  private headBytes = 0;
  private detectedPdf = false;
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

  get mimeType(): "application/pdf" {
    if (!this.detectedPdf) {
      throw new AppError(
        400,
        "PAYROLL_RECEIPT_TYPE_UNRECOGNIZED",
        "El contenido no es un PDF válido",
      );
    }
    return "application/pdf";
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
            "PAYROLL_RECEIPT_TOO_LARGE",
            `El archivo supera el máximo de ${this.maxBytes} bytes`,
          ),
        );
        return;
      }

      if (this.headBytes < MAGIC_WINDOW) {
        const need = MAGIC_WINDOW - this.headBytes;
        this.head.push(buf.subarray(0, Math.min(need, buf.length)));
        this.headBytes += Math.min(need, buf.length);
        if (this.headBytes >= MAGIC_WINDOW && !this.detectedPdf) {
          const headBuf = Buffer.concat(this.head);
          if (!detectPdfFromMagicBytes(headBuf)) {
            callback(
              new AppError(
                400,
                "PAYROLL_RECEIPT_TYPE_UNRECOGNIZED",
                "El contenido no es un PDF válido",
              ),
            );
            return;
          }
          this.detectedPdf = true;
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
        callback(new AppError(400, "PAYROLL_RECEIPT_EMPTY", "El archivo está vacío"));
        return;
      }
      if (!this.detectedPdf) {
        const headBuf = Buffer.concat(this.head);
        if (!detectPdfFromMagicBytes(headBuf)) {
          callback(
            new AppError(
              400,
              "PAYROLL_RECEIPT_TYPE_UNRECOGNIZED",
              "El contenido no es un PDF válido",
            ),
          );
          return;
        }
        this.detectedPdf = true;
      }
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
