/** Mirror backend normalizeCategoryName for client-side exact-match checks. */
export function normalizeCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-AR");
}
