/** URL base de la app operativa (sin barra final). */
export function getOperationsAppUrl(): string {
  const fromEnv = import.meta.env?.VITE_OPERATIONS_APP_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const fromTest = (globalThis as { __VITE_OPERATIONS_APP_URL__?: string }).__VITE_OPERATIONS_APP_URL__;
  if (fromTest?.trim()) {
    return fromTest.trim().replace(/\/$/, "");
  }
  return "http://localhost:8084";
}

export function getOperationsLoginUrl(): string {
  return `${getOperationsAppUrl()}/login`;
}
