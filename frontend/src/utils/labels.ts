import type { LocationStatus, PunctualityStatus, ValidationStatus } from "../types/attendance";
import type { InventoryStatus } from "../types/inventory";

export const inventoryStatusLabels: Record<InventoryStatus, string> = {
  SCHEDULED: "Programado",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

export const validationStatusLabels: Record<ValidationStatus, string> = {
  VALID: "Válido",
  PENDING_REVIEW: "Pendiente",
  REJECTED: "Rechazado",
};

export const locationStatusLabels: Record<LocationStatus, string> = {
  INSIDE_GEOFENCE: "Dentro del radio",
  OUTSIDE_GEOFENCE: "Fuera del radio",
  INVALID_LOCATION: "Ubicación inválida",
};

export const punctualityStatusLabels: Record<PunctualityStatus, string> = {
  EARLY: "Temprano",
  ON_TIME: "A tiempo",
  LATE: "Tarde",
  OUTSIDE_TIME_WINDOW: "Fuera de horario",
};

export const activeStatusLabel = (active: boolean): string => (active ? "Activo" : "Inactivo");

export const operationalStatusLabels: Record<
  import("../types/attendance").OperationalStatus,
  string
> = {
  NO_CHECK_IN: "Sin registro",
  VALID: "Validado",
  PENDING_REVIEW: "Pendiente",
  REJECTED: "Rechazado",
};
