export class TwilioFormBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwilioFormBodyError";
  }
}

const isScalarValue = (value: unknown): value is string | number | boolean | bigint =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean" ||
  typeof value === "bigint";

export function normalizeTwilioFormBody(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new TwilioFormBodyError("Body must be a plain object");
  }

  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof key !== "string") {
      throw new TwilioFormBodyError("Body keys must be strings");
    }

    if (value === null || value === undefined) {
      throw new TwilioFormBodyError(`Unexpected empty value for key "${key}"`);
    }

    if (Array.isArray(value)) {
      throw new TwilioFormBodyError(`Unexpected array value for key "${key}"`);
    }

    if (typeof value === "object") {
      throw new TwilioFormBodyError(`Unexpected nested object for key "${key}"`);
    }

    if (!isScalarValue(value)) {
      throw new TwilioFormBodyError(`Unexpected value type for key "${key}"`);
    }

    normalized[key] = typeof value === "string" ? value : String(value);
  }

  return normalized;
}
