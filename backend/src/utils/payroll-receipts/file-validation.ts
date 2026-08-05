import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { AppError } from "../../errors/app-error";

const FORBIDDEN_EXTENSIONS = new Set([
  ".exe",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".htm",
  ".svg",
  ".zip",
  ".rar",
  ".7z",
  ".bat",
  ".cmd",
  ".sh",
  ".php",
  ".dll",
  ".so",
  ".docm",
  ".xlsm",
  ".pptm",
]);

export const sanitizeOriginalFileName = (raw: string): string => {
  const trimmed = raw.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  const base = trimmed.split(/[/\\]/).pop() ?? "file";
  const withoutTraversal = base.replace(/\.\./g, "");
  const sanitized = withoutTraversal.replace(/[^\w.\- ()áéíóúÁÉÍÓÚñÑ]/gi, "_").slice(0, 180);
  return sanitized.length > 0 ? sanitized : "file";
};

export const detectPdfFromMagicBytes = (buffer: Buffer): boolean => {
  if (buffer.length < 4) {
    return false;
  }
  return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
};

export const sha256Hex = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

export const newPayrollReceiptId = (): string => randomUUID();

/**
 * Object key:
 * `{prefix}/companies/{companyId}/payroll-receipts/{year}/{month}/{receiptId}/original`
 */
export const buildPayrollReceiptObjectKey = (input: {
  storagePrefix: string;
  companyId: string;
  year: number;
  month: number;
  receiptId: string;
}): string => {
  const prefix = input.storagePrefix.replace(/^\/+|\/+$/g, "") || "payroll-receipts";
  const year = String(input.year);
  const month = String(input.month);
  for (const part of [input.companyId, year, month, input.receiptId]) {
    if (!part || part.includes("..") || part.includes("/") || part.includes("\\")) {
      throw new AppError(400, "INVALID_OBJECT_KEY_PART", "Identificador de recibo inválido");
    }
  }
  return `${prefix}/companies/${input.companyId}/payroll-receipts/${year}/${month}/${input.receiptId}/original`;
};

export const assertPayrollReceiptPdfMetadata = (input: {
  originalFileName: string;
  declaredContentType: string;
  sizeBytes?: number;
  maxFileSizeBytes?: number;
}): { originalFileName: string } => {
  if (input.sizeBytes != null) {
    if (input.sizeBytes === 0) {
      throw new AppError(400, "PAYROLL_RECEIPT_EMPTY", "El archivo está vacío");
    }
    if (
      input.maxFileSizeBytes != null &&
      input.sizeBytes > input.maxFileSizeBytes
    ) {
      throw new AppError(
        413,
        "PAYROLL_RECEIPT_TOO_LARGE",
        `El archivo supera el máximo de ${input.maxFileSizeBytes} bytes`,
      );
    }
  }

  const originalFileName = sanitizeOriginalFileName(input.originalFileName);
  const ext = extname(originalFileName).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new AppError(400, "PAYROLL_RECEIPT_EXTENSION_FORBIDDEN", "Extensión de archivo no permitida");
  }
  if (ext && ext !== ".pdf") {
    throw new AppError(
      400,
      "PAYROLL_RECEIPT_EXTENSION_MISMATCH",
      "Solo se permiten archivos PDF",
    );
  }

  const declared = input.declaredContentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== "application/pdf"
  ) {
    throw new AppError(
      400,
      "PAYROLL_RECEIPT_MIME_MISMATCH",
      "El tipo declarado no coincide con un PDF",
    );
  }

  return { originalFileName };
};

export const assertPayrollReceiptPdfFile = (input: {
  originalFileName: string;
  declaredContentType: string;
  buffer: Buffer;
  maxFileSizeBytes: number;
}): {
  checksumSha256: string;
  originalFileName: string;
  mimeType: "application/pdf";
} => {
  const { originalFileName } = assertPayrollReceiptPdfMetadata({
    originalFileName: input.originalFileName,
    declaredContentType: input.declaredContentType,
    sizeBytes: input.buffer.length,
    maxFileSizeBytes: input.maxFileSizeBytes,
  });

  if (!detectPdfFromMagicBytes(input.buffer)) {
    throw new AppError(
      400,
      "PAYROLL_RECEIPT_TYPE_UNRECOGNIZED",
      "El contenido no es un PDF válido",
    );
  }

  return {
    checksumSha256: sha256Hex(input.buffer),
    originalFileName,
    mimeType: "application/pdf",
  };
};
