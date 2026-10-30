/** Max length for employee category display names. */
export const EMPLOYEE_CATEGORY_NAME_MAX_LENGTH = 120;

/**
 * Normalize a category name for uniqueness checks (case-insensitive, trim + collapse spaces).
 * Display name should still use a separately trimmed (non-collapsed) value.
 */
export function normalizeCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
}

/** Trim and collapse internal whitespace for storage of the display name. */
export function canonicalizeCategoryDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
