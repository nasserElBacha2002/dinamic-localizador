import type { RequestHandler } from "express";
import morgan from "morgan";
import { env } from "../config/env";
import { sanitizeUrlForLogs } from "../utils/log-redaction";

morgan.token("safe-url", (req) => {
  const raw =
    ("originalUrl" in req && typeof (req as { originalUrl?: string }).originalUrl === "string"
      ? (req as { originalUrl: string }).originalUrl
      : null) ||
    req.url ||
    "";
  return sanitizeUrlForLogs(raw);
});

/**
 * Access logging that never prints raw invitation/auth secrets from the URL.
 * Uses combined-like format with `:safe-url` instead of `:url`.
 */
export const createAccessLogger = (): RequestHandler => {
  const format =
    env.NODE_ENV === "production"
      ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length]'
      : ":method :safe-url :status :response-time ms";

  return morgan(format);
};
