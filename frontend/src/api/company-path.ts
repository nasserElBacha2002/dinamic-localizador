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

export function companyApiPath(resourcePath: string): string {
  const companyId = getActiveCompanyId();
  if (!companyId) {
    throw new Error("No hay una empresa activa seleccionada.");
  }

  const normalized = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
  return `/companies/${companyId}${normalized}`;
}
