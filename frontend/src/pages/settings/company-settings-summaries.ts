import type { CompanyAbsenceSetting } from "../../types/company-absence-settings";
import type { CompanyLocationType } from "../../types/company-location-type";
import type { CompanyModule } from "../../types/company-module";
import type { CompanySettings } from "../../types/company-settings";

export function formatOperationSchedule(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const start = startTime?.trim() || "—";
  const end = endTime?.trim() || "—";
  return `${start} → ${end}`;
}

export function formatActiveInactive(value: boolean): string {
  return value ? "Activo" : "Inactivo";
}

export function formatMinutes(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return `${value} min`;
}

export function formatMeters(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return `${value} m`;
}

export function buildGeneralSettingsSummary(settings: CompanySettings) {
  return [{ label: "Zona horaria", value: settings.operationTimezone }];
}

export function buildOperationOperationSummary(settings: CompanySettings) {
  const items = [
    { label: "Horario", value: formatOperationSchedule(settings.defaultOperationStartTime, settings.defaultOperationEndTime) },
    {
      label: "Tolerancias",
      value: `Temprana ${settings.defaultEarlyArrivalToleranceMinutes} min · Tardía ${settings.defaultLateArrivalToleranceMinutes} min`,
    },
    { label: "Radio permitido", value: formatMeters(settings.defaultRadiusMeters) },
  ];

  if (settings.geofenceReviewMarginMeters !== null) {
    items.push({
      label: "Margen revisión",
      value: formatMeters(settings.geofenceReviewMarginMeters),
    });
  }

  return items;
}

export function buildWhatsAppSummary(settings: CompanySettings) {
  return [
    { label: "Puntualidad", value: formatMinutes(settings.lateGraceMinutes) },
    { label: "Salida anticipada", value: formatMinutes(settings.earlyLeaveToleranceMinutes) },
  ];
}

export function buildCheckoutSummary(settings: CompanySettings) {
  return [
    {
      label: "Ubicación al finalizar",
      value: formatActiveInactive(settings.requireCheckoutLocation),
    },
  ];
}

export function buildCorrectionsSummary(settings: CompanySettings) {
  return [
    {
      label: "Correcciones manuales",
      value: formatActiveInactive(settings.allowManualAttendanceCorrections),
    },
  ];
}

export function buildAbsenceSummary(settings: CompanyAbsenceSetting[]) {
  const configured = settings.filter((row) => row.isActive);
  const autoAssigned = configured.filter((row) => row.autoAssignOnEmployeeCreate);
  const examples = autoAssigned.slice(0, 2).map((row) => `${row.absenceTypeName}: ${row.defaultAnnualDays} días`);

  return {
    summaryItems: [
      { label: "Tipos configurados", value: `${configured.length} tipos configurados` },
      {
        label: "Auto-asignados",
        value: `${autoAssigned.length} se asignan automáticamente`,
      },
      ...examples.map((example) => ({ label: "Ejemplo", value: example })),
    ],
  };
}

export function buildLocationTypesSummary(locationTypes: CompanyLocationType[]) {
  const active = locationTypes.filter((type) => type.isActive);
  const inactive = locationTypes.filter((type) => !type.isActive);
  const chips = active.slice(0, 3).map((type) => type.name);

  return {
    summaryItems: [
      { label: "Activos", value: `${active.length} activos` },
      { label: "Inactivos", value: `${inactive.length} inactivos` },
    ],
    chips,
  };
}

export function buildModulesSummary(modules: CompanyModule[]) {
  const enabled = modules.filter((module) => module.isEnabled);
  return [{ label: "Habilitados", value: `${enabled.length} de ${modules.length}` }];
}
