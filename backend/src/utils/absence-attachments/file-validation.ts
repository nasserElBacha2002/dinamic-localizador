import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { AppError } from "../../errors/app-error";
import {
  ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES,
  type AbsenceAttachmentAllowedMime,
} from "../../types/absence-attachment";

const MIME_EXTENSIONS: Record<AbsenceAttachmentAllowedMime, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

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

export const normalizeFileName = (original: string, detectedMime: AbsenceAttachmentAllowedMime): string => {
  const sanitized = sanitizeOriginalFileName(original);
  const ext = MIME_EXTENSIONS[detectedMime][0];
  const withoutExt = sanitized.replace(/\.[^.]+$/, "");
  return `${withoutExt || "file"}${ext}`;
};

export const buildAbsenceAttachmentObjectKey = (input: {
  storagePrefix: string;
  companyId: string;
  absenceRequestId: string;
  attachmentId: string;
}): string => {
  const prefix = input.storagePrefix.replace(/^\/+|\/+$/g, "") || "absence-attachments";
  for (const part of [input.companyId, input.absenceRequestId, input.attachmentId]) {
    if (!part || part.includes("..") || part.includes("/") || part.includes("\\")) {
      throw new AppError(400, "INVALID_OBJECT_KEY_PART", "Identificador de adjunto inválido");
    }
  }
  return `${prefix}/companies/${input.companyId}/absence-requests/${input.absenceRequestId}/attachments/${input.attachmentId}/original`;
};

export const newAttachmentId = (): string => randomUUID();

export const sha256Hex = (buffer: Buffer): string =>
  createHash("sha256").update(buffer).digest("hex");

export const detectMimeFromMagicBytes = (buffer: Buffer): AbsenceAttachmentAllowedMime | null => {
  if (buffer.length < 12) {
    return null;
  }
  // PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
};

export const assertAllowedAttachmentFile = (input: {
  originalFileName: string;
  declaredContentType: string;
  buffer: Buffer;
  maxFileSizeBytes: number;
}): {
  detectedContentType: AbsenceAttachmentAllowedMime;
  checksumSha256: string;
  normalizedFileName: string;
  originalFileName: string;
} => {
  if (input.buffer.length === 0) {
    throw new AppError(400, "ATTACHMENT_EMPTY", "El archivo está vacío");
  }
  if (input.buffer.length > input.maxFileSizeBytes) {
    throw new AppError(
      413,
      "ATTACHMENT_TOO_LARGE",
      `El archivo supera el máximo de ${input.maxFileSizeBytes} bytes`,
    );
  }

  const originalFileName = sanitizeOriginalFileName(input.originalFileName);
  const ext = extname(originalFileName).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new AppError(400, "ATTACHMENT_EXTENSION_FORBIDDEN", "Extensión de archivo no permitida");
  }

  const detected = detectMimeFromMagicBytes(input.buffer);
  if (!detected) {
    throw new AppError(
      400,
      "ATTACHMENT_TYPE_UNRECOGNIZED",
      "No se pudo verificar el tipo real del archivo",
    );
  }

  if (!ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES.includes(detected)) {
    throw new AppError(400, "ATTACHMENT_TYPE_FORBIDDEN", "Tipo de archivo no permitido");
  }

  const allowedExts = MIME_EXTENSIONS[detected];
  if (ext && !allowedExts.includes(ext)) {
    throw new AppError(
      400,
      "ATTACHMENT_EXTENSION_MISMATCH",
      "La extensión no coincide con el contenido del archivo",
    );
  }

  const declared = input.declaredContentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    declared &&
    declared !== "application/octet-stream" &&
    declared !== detected &&
    !(declared === "image/jpg" && detected === "image/jpeg")
  ) {
    throw new AppError(
      400,
      "ATTACHMENT_MIME_MISMATCH",
      "El tipo declarado no coincide con el contenido del archivo",
    );
  }

  return {
    detectedContentType: detected,
    checksumSha256: sha256Hex(input.buffer),
    normalizedFileName: normalizeFileName(originalFileName, detected),
    originalFileName,
  };
};

export const isInlineDispositionMime = (mime: string): boolean =>
  mime === "application/pdf" ||
  mime === "image/jpeg" ||
  mime === "image/png" ||
  mime === "image/webp";
