/**
 * Argentine CUIT/CUIL helpers for payroll receipt filename matching.
 * Employee CUIL lives in `employees.document_number` (API: documentNumber).
 */

export type ExtractDocumentResult =
  | { outcome: "success"; normalizedDocument: string; detectedRaw: string }
  | { outcome: "not_found" }
  | { outcome: "invalid"; reason: string }
  | { outcome: "ambiguous" };

const CUIL_MULTIPLIERS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Strip non-digits; return 11-digit string or null. */
export function normalizeEmployeeDocument(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/**
 * Normalize a raw candidate to exactly 11 digits when possible.
 * Accepts already-digit strings of length 11, or formatted values that strip to 11.
 */
export function normalizeToElevenDigits(value: string): string | null {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/** AFIP CUIT/CUIL check digit (multipliers 5,4,3,2,7,6,5,4,3,2). */
export function isValidCuilChecksum(digits11: string): boolean {
  if (!/^\d{11}$/.test(digits11)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits11[i]) * CUIL_MULTIPLIERS[i];
  }
  const mod = sum % 11;
  let check = 11 - mod;
  if (check === 11) {
    check = 0;
  } else if (check === 10) {
    check = 9;
  }
  return check === Number(digits11[10]);
}

/** Mask CUIL for logs — last 4 digits only. */
export function maskDocumentForLog(normalized: string | null | undefined): string {
  if (!normalized || normalized.length < 4) {
    return "****";
  }
  return `****${normalized.slice(-4)}`;
}

function basenameWithoutExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0) {
    return base;
  }
  return base.slice(0, lastDot);
}

type CandidateHit = { raw: string; normalized: string };

/**
 * Collect CUIL-shaped candidates from a basename (no extension).
 * - 11 consecutive digits
 * - XX-XXXXXXXX-X with optional spaces / dots / dashes between groups
 */
function collectCandidates(basename: string): CandidateHit[] {
  const hits: CandidateHit[] = [];
  const seen = new Set<string>();

  const addHit = (raw: string) => {
    const normalized = normalizeToElevenDigits(raw);
    if (!normalized) {
      return;
    }
    const key = `${normalized}|${raw}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hits.push({ raw, normalized });
  };

  const formatted = /\d{2}[\s.-]*\d{8}[\s.-]*\d/g;
  let match: RegExpExecArray | null;
  while ((match = formatted.exec(basename)) !== null) {
    addHit(match[0]);
  }

  const plain = /\d{11}/g;
  while ((match = plain.exec(basename)) !== null) {
    addHit(match[0]);
  }

  return hits;
}

/**
 * Extract and validate a CUIL/CUIT from a payroll receipt filename.
 * Uses basename only (strips path and extension).
 */
export function extractAndValidateDocumentFromFilename(filename: string): ExtractDocumentResult {
  const basename = basenameWithoutExtension(filename);
  const candidates = collectCandidates(basename);

  if (candidates.length === 0) {
    return { outcome: "not_found" };
  }

  const validByNormalized = new Map<string, string>();
  for (const hit of candidates) {
    if (isValidCuilChecksum(hit.normalized) && !validByNormalized.has(hit.normalized)) {
      validByNormalized.set(hit.normalized, hit.raw);
    }
  }

  if (validByNormalized.size > 1) {
    return { outcome: "ambiguous" };
  }

  if (validByNormalized.size === 1) {
    const [normalizedDocument, detectedRaw] = [...validByNormalized.entries()][0]!;
    return { outcome: "success", normalizedDocument, detectedRaw };
  }

  return {
    outcome: "invalid",
    reason: "Ningún CUIL/CUIT del nombre de archivo pasó la validación de dígito verificador",
  };
}
