export const ACTIVE_COMPANY_REQUIRED = "ACTIVE_COMPANY_REQUIRED";

export class ActiveCompanyRequiredError extends Error {
  readonly code = ACTIVE_COMPANY_REQUIRED;

  constructor() {
    super("No hay una empresa activa seleccionada.");
    this.name = "ActiveCompanyRequiredError";
  }
}

const ACTIVE_COMPANY_STORAGE_KEY = "dinamic.activeCompanyId";

const GLOBAL_API_PREFIXES = ["auth", "health", "webhooks", "database"] as const;

export const OPERATIONAL_API_PREFIXES = [
  "employees",
  "employee-categories",
  "operations",
  "services",
  "attendance",
  "statistics",
  "absence-types",
  "absence-requests",
  "bot-simulator",
  "users",
  "settings",
  "modules",
  "lookups",
  "work-teams",
  "work-team-assignment-batches",
  "imports",
  "dev",
] as const;

/** @deprecated Use scopedApiPath via scopedApiClient instead. */
export const LEGACY_OPERATIONAL_API_PREFIXES = OPERATIONAL_API_PREFIXES.filter(
  (prefix) => prefix !== "dev",
);

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

function normalizePath(path: string): string {
  return path.replace(/^\//, "");
}

function isOperationalPath(path: string): boolean {
  const firstSegment = path.split("/")[0];
  return OPERATIONAL_API_PREFIXES.includes(
    firstSegment as (typeof OPERATIONAL_API_PREFIXES)[number],
  );
}

function isGlobalPath(path: string): boolean {
  const firstSegment = path.split("/")[0];
  return GLOBAL_API_PREFIXES.includes(firstSegment as (typeof GLOBAL_API_PREFIXES)[number]);
}

export function companyApiPath(resourcePath: string): string {
  const companyId = getActiveCompanyId();
  if (!companyId) {
    throw new ActiveCompanyRequiredError();
  }

  return companyApiPathFor(companyId, resourcePath);
}

/**
 * Build a company-scoped path with an explicit company id (immutable for in-flight requests).
 */
export function companyApiPathFor(companyId: string, resourcePath: string): string {
  const normalized = normalizePath(resourcePath);
  return `companies/${companyId}/${normalized}`;
}

/**
 * Resolve operational path using either an explicit company scope or the active company.
 */
export function scopedApiPath(path: string, scopeCompanyId?: string): string {
  const normalized = normalizePath(path);

  if (!normalized) {
    return normalized;
  }

  if (normalized.startsWith("companies/") || normalized === "companies") {
    return normalized;
  }

  if (isGlobalPath(normalized)) {
    return normalized;
  }

  if (isOperationalPath(normalized)) {
    if (scopeCompanyId) {
      return companyApiPathFor(scopeCompanyId, normalized);
    }
    return companyApiPath(normalized);
  }

  return normalized;
}

let companySelectionRequiredHandler: (() => void) | null = null;

export function setCompanySelectionRequiredHandler(handler: (() => void) | null): void {
  companySelectionRequiredHandler = handler;
}

export function notifyCompanySelectionRequired(): void {
  companySelectionRequiredHandler?.();
}

export function isLegacyOperationalApiPath(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  const normalized = normalizePath(url);
  if (normalized.startsWith("companies/")) {
    return false;
  }

  const [firstSegment] = normalized.split(/[/?#]/);
  return LEGACY_OPERATIONAL_API_PREFIXES.includes(
    firstSegment as (typeof LEGACY_OPERATIONAL_API_PREFIXES)[number],
  );
}
