export const DISPLAY_FALLBACK = "—";
export const UNASSIGNED_LABEL = "Sin asignar";

export function safeText(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : DISPLAY_FALLBACK;
}

export function getRelatedName(value?: { name?: string | null } | null): string {
  const trimmed = value?.name?.trim();
  return trimmed || UNASSIGNED_LABEL;
}

export function safeArrayCount(value?: unknown[] | null): number {
  return Array.isArray(value) ? value.length : 0;
}

export function formatDistanceMeters(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return DISPLAY_FALLBACK;
  }

  return `${value.toFixed(1)} m`;
}
