export const ACTIVE_COMPANY_REQUIRED = "ACTIVE_COMPANY_REQUIRED";

export class ActiveCompanyRequiredError extends Error {
  readonly code = ACTIVE_COMPANY_REQUIRED;

  constructor() {
    super("No hay una empresa activa seleccionada.");
    this.name = "ActiveCompanyRequiredError";
  }
}

const ACTIVE_COMPANY_STORAGE_KEY = "dinamic.activeCompanyId";

export function getStoredCompanyId(): string | null {
  return localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
}

export function setStoredCompanyId(companyId: string | null): void {
  if (!companyId) {
    localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
    return;
  }

  localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
}

let runtimeCompanyId: string | null = null;

export function setRuntimeCompanyId(companyId: string | null): void {
  runtimeCompanyId = companyId;
  setStoredCompanyId(companyId);
}

export function getActiveCompanyId(): string | null {
  return runtimeCompanyId ?? getStoredCompanyId();
}

export function clearActiveCompanyId(): void {
  runtimeCompanyId = null;
  setStoredCompanyId(null);
}

/**
 * Builds a company-scoped API path relative to the axios baseURL (e.g. companies/:id/employees).
 * Avoids a leading slash so axios keeps the /api prefix from baseURL.
 */
export function companyApiPath(resourcePath: string): string {
  const companyId = getActiveCompanyId();
  if (!companyId) {
    throw new ActiveCompanyRequiredError();
  }

  const normalized = resourcePath.startsWith("/") ? resourcePath.slice(1) : resourcePath;
  return `companies/${companyId}/${normalized}`;
}

let companySelectionRequiredHandler: (() => void) | null = null;

export function setCompanySelectionRequiredHandler(handler: (() => void) | null): void {
  companySelectionRequiredHandler = handler;
}

export function notifyCompanySelectionRequired(): void {
  companySelectionRequiredHandler?.();
}
