import { createHash, randomUUID } from "node:crypto";
import { maskPhoneNumberForLog } from "./phone";

const SENSITIVE_KEYS = new Set([
  "authtoken",
  "authorization",
  "password",
  "secret",
  "token",
  "cookie",
  "accountsid",
  "apikey",
]);

export const createCorrelationId = (): string => randomUUID();

export const hashPhoneForObservability = (phoneNormalized: string, salt: string): string =>
  createHash("sha256").update(`${salt}:${phoneNormalized}`).digest("hex");

export const maskPhoneForObservability = (phone: string): string => maskPhoneNumberForLog(phone);

export const truncateJson = (value: unknown, maxChars = 4000): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw.length <= maxChars) {
    return raw;
  }
  return `${raw.slice(0, maxChars - 20)}…[truncated]`;
};

export const sanitizeObservabilityPayload = (
  payload: Record<string, unknown> | null | undefined,
  maxChars = 4000,
): string | null => {
  if (!payload) {
    return null;
  }

  const sanitizeValue = (value: unknown, depth: number): unknown => {
    if (depth > 4) {
      return "[MAX_DEPTH]";
    }
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
    }
    if (value && typeof value === "object") {
      const nested: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""))) {
          nested[key] = "[REDACTED]";
          continue;
        }
        nested[key] = sanitizeValue(nestedValue, depth + 1);
      }
      return nested;
    }
    if (typeof value === "string" && value.length > 500) {
      return `${value.slice(0, 500)}…[truncated]`;
    }
    return value;
  };

  return truncateJson(sanitizeValue(payload, 0), maxChars);
};

export const buildProviderEventKey = (input: {
  messageSid: string;
  status: string;
  errorCode?: string | null;
  providerTimestamp?: string | null;
  payloadHash?: string | null;
}): string => {
  const parts = [
    input.messageSid,
    input.status.toLowerCase(),
    input.errorCode ?? "",
    input.providerTimestamp ?? "",
    input.payloadHash ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 64);
};

export const pickProjectedProviderStatus = (
  current: string | null | undefined,
  incoming: string,
  rankMap: Record<string, number>,
): string => {
  const next = incoming.toLowerCase();
  if (!current) {
    return next;
  }
  const currentRank = rankMap[current.toLowerCase()] ?? 0;
  const nextRank = rankMap[next] ?? 0;
  // Prefer terminal failure over earlier success when ranks equal or higher terminal.
  if (next === "failed" || next === "undelivered") {
    return next;
  }
  if (current === "failed" || current === "undelivered") {
    return current.toLowerCase();
  }
  return nextRank >= currentRank ? next : current.toLowerCase();
};

/** SQL CASE matching WHATSAPP_PROVIDER_STATUS_RANK for monotonic UPDATEs. */
export const providerStatusRankSqlExpr = (columnOrParam: string): string => `
  CASE LOWER(${columnOrParam})
    WHEN N'accepted' THEN 10
    WHEN N'queued' THEN 20
    WHEN N'sending' THEN 30
    WHEN N'sent' THEN 40
    WHEN N'delivered' THEN 50
    WHEN N'read' THEN 60
    WHEN N'undelivered' THEN 70
    WHEN N'failed' THEN 80
    WHEN N'canceled' THEN 90
    WHEN N'cancelled' THEN 90
    ELSE 0
  END
`;

/**
 * WHERE predicate: apply incoming provider status only when it does not regress
 * (mirrors pickProjectedProviderStatus for outbox rows).
 */
export const monotonicProviderStatusAdvanceSql = (
  currentColumn: string,
  incomingParam: string,
): string => `
  (
    ${currentColumn} IS NULL
    OR LOWER(${incomingParam}) IN (N'failed', N'undelivered')
    OR (
      LOWER(${currentColumn}) NOT IN (N'failed', N'undelivered')
      AND ${providerStatusRankSqlExpr(incomingParam)} >= ${providerStatusRankSqlExpr(currentColumn)}
    )
  )
`;
