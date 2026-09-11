import { maskPhoneNumberForLog } from "../phone";
import type { SystemLogMetadata, SystemLogSerializedError } from "../../types/system-logs";

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_RE =
  /^(password|passwordhash|token|accesstoken|refreshtoken|invitationtoken|resettoken|authorization|cookie|secret|clientsecret|apikey|providerapikey|accountsid|authtoken|twilioauthtoken|connectionstring|signedurl|contentsid|privatekey|rawpayload|documentcontent|receiptcontent|authheader)$/i;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[_-]/g, "");

export const isSensitiveSystemLogKey = (key: string): boolean =>
  SENSITIVE_KEY_RE.test(normalizeKey(key));

const EMAIL_RE = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const E164_RE = /\+[1-9]\d{7,14}/g;

export const maskEmailForLog = (value: string): string =>
  value.replace(EMAIL_RE, (_m, user: string, domain: string) => {
    const visible = user.slice(0, Math.min(2, user.length));
    return `${visible}***@${domain}`;
  });

export const maskSensitiveFreeText = (value: string): string => {
  let next = value.replace(E164_RE, (phone) => maskPhoneNumberForLog(phone));
  next = maskEmailForLog(next);
  next = next.replace(
    /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
    "$1[REDACTED]",
  );
  next = next.replace(
    /(api[_-]?key|auth[_-]?token|password|connection[_-]?string)\s*[:=]\s*\S+/gi,
    "$1=[REDACTED]",
  );
  return next;
};

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - 14))}…[truncated]`;
};

export type SanitizeSystemLogOptions = {
  maxDepth?: number;
  maxKeys?: number;
  maxStringBytes?: number;
  maxMetadataBytes?: number;
  maxStackBytes?: number;
};

const DEFAULTS: Required<SanitizeSystemLogOptions> = {
  maxDepth: 6,
  maxKeys: 40,
  maxStringBytes: 2000,
  maxMetadataBytes: 8_000,
  maxStackBytes: 8_000,
};

export const serializeErrorForSystemLog = (
  error: unknown,
  maxStackBytes = DEFAULTS.maxStackBytes,
): SystemLogSerializedError | null => {
  if (error == null) {
    return null;
  }
  if (error instanceof Error) {
    return {
      name: truncate(maskSensitiveFreeText(error.name || "Error"), 200),
      message: truncate(maskSensitiveFreeText(error.message || ""), 1000),
      stack: error.stack
        ? truncate(maskSensitiveFreeText(error.stack), maxStackBytes)
        : undefined,
    };
  }
  if (typeof error === "string") {
    return {
      name: "Error",
      message: truncate(maskSensitiveFreeText(error), 1000),
    };
  }
  try {
    return {
      name: "Error",
      message: truncate(maskSensitiveFreeText(JSON.stringify(error)), 1000),
    };
  } catch {
    return { name: "Error", message: "[unserializable]" };
  }
};

const sanitizeUnknown = (
  value: unknown,
  options: Required<SanitizeSystemLogOptions>,
  depth: number,
  seen: WeakSet<object>,
): unknown => {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return truncate(maskSensitiveFreeText(value), options.maxStringBytes);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return serializeErrorForSystemLog(value, options.maxStackBytes);
  }
  if (depth >= options.maxDepth) {
    return "[MaxDepth]";
  }
  if (Array.isArray(value)) {
    return value.slice(0, options.maxKeys).map((item) => sanitizeUnknown(item, options, depth + 1, seen));
  }
  if (typeof value === "object") {
    if (seen.has(value as object)) {
      return "[Circular]";
    }
    seen.add(value as object);
    const output: Record<string, unknown> = {};
    let count = 0;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (count >= options.maxKeys) {
        output.__truncated__ = true;
        break;
      }
      count += 1;
      if (isSensitiveSystemLogKey(key)) {
        output[key] = REDACTED;
        continue;
      }
      // Never keep exact coordinates
      if (/^(lat|latitude|lng|lon|longitude|received_latitude|received_longitude)$/i.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = sanitizeUnknown(nested, options, depth + 1, seen);
    }
    return output;
  }
  return String(value);
};

export const sanitizeSystemLogMetadata = (
  metadata: SystemLogMetadata | null | undefined,
  options?: SanitizeSystemLogOptions,
): SystemLogMetadata | null => {
  if (metadata == null) {
    return null;
  }
  const opts = { ...DEFAULTS, ...options };
  try {
    const sanitized = sanitizeUnknown(metadata, opts, 0, new WeakSet()) as SystemLogMetadata;
    const raw = JSON.stringify(sanitized);
    if (raw.length <= opts.maxMetadataBytes) {
      return sanitized;
    }
    return {
      __truncated__: true,
      preview: truncate(raw, opts.maxMetadataBytes),
    };
  } catch {
    return { __sanitizeFailed: true };
  }
};

export const sanitizeSystemLogMessage = (message: string, max = 1000): string =>
  truncate(maskSensitiveFreeText(message), max);
