import { z } from "zod";

/**
 * Parse query values that may arrive as:
 * - `employeeIds=id1,id2`
 * - repeated `employeeIds=id1&employeeIds=id2`
 * - legacy singular `employeeId=id1` (via mergeLegacySingularId)
 */

/** Max IDs accepted in a multi-value filter after trim + dedupe. */
export const MAX_MULTI_FILTER_IDS = 100;

export function parseUuidIdList(raw: unknown): string[] {
  if (raw == null || raw === "") {
    return [];
  }

  const chunks = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const chunk of chunks) {
    for (const part of String(chunk).split(",")) {
      const id = part.trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

export const uuidIdListSchema = z.preprocess(
  (value) => parseUuidIdList(value),
  z
    .array(z.string().uuid("UUID inválido"))
    .max(
      MAX_MULTI_FILTER_IDS,
      `Máximo ${MAX_MULTI_FILTER_IDS} identificadores por filtro`,
    )
    .default([]),
);

/**
 * Combine legacy singular id with plural list.
 * Policy: keep plural order, then append singular if not already present.
 *
 * Example: employeeIds=B,C + employeeId=A → [B, C, A]
 */
export function mergeLegacySingularId(
  list: string[],
  singular: string | undefined,
): string[] {
  const merged = [...list];
  const seen = new Set(list);
  if (singular && !seen.has(singular)) {
    merged.push(singular);
  }
  return merged;
}

export function assertWithinMultiFilterLimit(ids: string[]): string[] {
  if (ids.length > MAX_MULTI_FILTER_IDS) {
    throw new z.ZodError([
      {
        code: "custom",
        message: `Máximo ${MAX_MULTI_FILTER_IDS} identificadores por filtro`,
        path: [],
      },
    ]);
  }
  return ids;
}
