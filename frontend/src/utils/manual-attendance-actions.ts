import type { AttendanceRecord, ManualAttendanceKind } from "../types/attendance";
import type { CompanyPermission } from "../types/permissions";
import { hasPermission } from "./permissions";

export type ManualAttendanceActionKey =
  | "register-check-in"
  | "register-check-out"
  | "edit-check-in"
  | "edit-check-out";

export interface ManualAttendanceAction {
  key: ManualAttendanceActionKey;
  label: string;
  kind: ManualAttendanceKind;
  mode: "create" | "edit";
}

export function resolveManualAttendanceActions(
  attendance: AttendanceRecord | null | undefined,
  options: {
    permissions: readonly string[] | undefined;
    allowManualAttendanceCorrections: boolean;
  },
): ManualAttendanceAction[] {
  if (!options.allowManualAttendanceCorrections) {
    return [];
  }

  const canCreate = hasPermission(
    options.permissions as CompanyPermission[] | undefined,
    "attendance:manual_create",
  );
  const canEdit = hasPermission(
    options.permissions as CompanyPermission[] | undefined,
    "attendance:manual_edit",
  );

  const hasArrival = Boolean(attendance?.receivedAt);
  const hasCheckout = Boolean(attendance?.checkoutAt);
  const actions: ManualAttendanceAction[] = [];

  if (!hasArrival && canCreate) {
    actions.push({
      key: "register-check-in",
      label: "Registrar llegada",
      kind: "CHECK_IN",
      mode: "create",
    });
  }

  if (hasArrival && canEdit) {
    actions.push({
      key: "edit-check-in",
      label: "Editar llegada",
      kind: "CHECK_IN",
      mode: "edit",
    });
  }

  if (!hasCheckout && canCreate) {
    actions.push({
      key: "register-check-out",
      label: "Registrar salida",
      kind: "CHECK_OUT",
      mode: "create",
    });
  }

  if (hasCheckout && canEdit) {
    actions.push({
      key: "edit-check-out",
      label: "Editar salida",
      kind: "CHECK_OUT",
      mode: "edit",
    });
  }

  return actions;
}

export function registrationSourceLabel(
  source: AttendanceRecord["arrivalSource"] | AttendanceRecord["checkoutSource"],
): string {
  switch (source) {
    case "MANUAL":
      return "Manual";
    case "WHATSAPP":
      return "WhatsApp";
    case "IMPORT":
      return "Importación";
    case "SYSTEM":
      return "Sistema";
    default:
      return "—";
  }
}

export function manualArrivalStatusLabel(
  punctuality: AttendanceRecord["punctualityStatus"] | null | undefined,
): string {
  if (!punctuality || punctuality === "NOT_RECORDED") {
    return "—";
  }
  if (punctuality === "LATE" || punctuality === "OUTSIDE_TIME_WINDOW") {
    return "Tarde";
  }
  return "En punto";
}

export function manualCheckoutStatusLabel(
  checkoutStatus: AttendanceRecord["checkoutStatus"] | null | undefined,
): string {
  if (!checkoutStatus) {
    return "—";
  }
  if (
    checkoutStatus === "CHECKOUT_EARLY_WITHIN_TOLERANCE" ||
    checkoutStatus === "CHECKOUT_EARLY_REVIEW"
  ) {
    return "Antes de hora";
  }
  return "A horario";
}
