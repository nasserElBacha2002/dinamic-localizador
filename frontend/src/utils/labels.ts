import type { AssignmentConfirmationStatus } from "../types/assignment-confirmation";
import type { LocationStatus, PunctualityStatus, ValidationStatus } from "../types/attendance";
import type { InventoryStatus } from "../types/inventory";

export const assignmentConfirmationStatusLabels: Record<AssignmentConfirmationStatus, string> = {
  CONFIRMED: "Confirmado",
  PENDING: "Pendiente de respuesta",
  UNAVAILABLE: "No disponible",
};

export const assignmentConfirmationStatusTableLabels: Record<AssignmentConfirmationStatus, string> =
  {
    CONFIRMED: "Confirmado",
    PENDING: "Pendiente",
    UNAVAILABLE: "No disponible",
  };

export const inventoryStatusLabels: Record<InventoryStatus, string> = {
  SCHEDULED: "Programado",
  IN_PROGRESS: "En curso",
  COMPLETED: "Finalizado",
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

export const membershipStatusLabels = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
} as const;

export const companyRoleLabels = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  HR: "RRHH",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operador",
  READ_ONLY: "Solo lectura",
} as const;

export const employeeTypeLabels: Record<import("../constants/employee-types").EmployeeType, string> = {
  fijo: "Fijo",
  eventual: "Eventual",
};

export const checkoutStatusLabels: Record<import("../types/attendance").CheckoutStatus, string> = {
  CHECKOUT_VALID: "Salida válida",
  CHECKOUT_EARLY_WITHIN_TOLERANCE: "Salida anticipada (tolerancia)",
  CHECKOUT_EARLY_REVIEW: "Salida anticipada (revisión)",
  CHECKOUT_LATE_EXTRA_TIME: "Salida con tiempo extra",
  CHECKOUT_LOCATION_REVIEW: "Salida (revisión ubicación)",
  CHECKOUT_REJECTED: "Salida rechazada",
};

export const operationalStatusLabels: Record<
  import("../types/attendance").OperationalStatus,
  string
> = {
  NO_CHECK_IN: "Sin registro",
  VALID: "Validado",
  PENDING_REVIEW: "Pendiente",
  REJECTED: "Rechazado",
};

export const operationalAttendanceStatusTableLabels: Record<
  import("../types/attendance").OperationalStatus,
  string
> = {
  NO_CHECK_IN: "Sin registro",
  VALID: "Validado",
  PENDING_REVIEW: "A revisar",
  REJECTED: "Rechazado",
};
