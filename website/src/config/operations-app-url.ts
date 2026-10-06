/** URL base de la app operativa (sin barra final). Vacío = mismo origen (producción unificada). */
export function getOperationsAppUrl(): string {
  const fromEnv = import.meta.env?.VITE_OPERATIONS_APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const fromTest = (globalThis as { __VITE_OPERATIONS_APP_URL__?: string }).__VITE_OPERATIONS_APP_URL__;
  if (fromTest?.trim()) {
    return fromTest.trim().replace(/\/$/, "");
  }
  return "";
}

/** Enlace a login: relativo `/login` en mismo dominio; absoluto solo si VITE_OPERATIONS_APP_URL está definida (dev). */
export function getOperationsLoginUrl(): string {
  const base = getOperationsAppUrl();
  if (!base) {
    return "/login";
  }
  return `${base}/login`;
}
