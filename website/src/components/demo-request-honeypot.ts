/** Ignora autofill del navegador en el honeypot; solo envía valor si hubo edición manual. */
export function marketingDemoHoneypotValue(
  raw: string | undefined,
  touchedByUser: boolean,
): string {
  if (!touchedByUser) {
    return "";
  }
  return raw?.trim() ?? "";
}