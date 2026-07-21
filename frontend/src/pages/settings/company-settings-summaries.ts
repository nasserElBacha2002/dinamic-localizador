import {
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "../../constants/operation-timezones";
import type { CompanyAbsenceSetting } from "../../types/company-absence-settings";
import type { CompanyLocationType } from "../../types/company-location-type";
import type { CompanyModule } from "../../types/company-module";
import type { CompanySettings } from "../../types/company-settings";
import type { EmployeeCategory } from "../../types/employee-category";
import type { CompanyWorkSchedule } from "../../types/schedule";
import { buildCompanySchedulePreviewLabel } from "../../utils/operation-schedule-display";

export function formatOperationSchedule(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const start = startTime?.trim() || "—";
  const end = endTime?.trim() || "—";
  return `${start} → ${end}`;
}

export function formatOperationScheduleSummary(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const start = startTime?.trim() || "—";
  const end = endTime?.trim() || "—";
  return `${start} a ${end}`;
}

export function formatHours(value: number | string | null | undefined, suffix = "h"): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return `${value} ${suffix}`;
}

export function formatTimezoneSummary(timezone: string): string {
  const canonical = getCanonicalOperationTimezone(timezone);
  return (
    getOperationTimezoneOptions(timezone).find((option) => option.value === canonical)?.label ??
    timezone
  );
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

export function buildOperationalSettingsSummary(settings: CompanySettings) {
  return {
    summaryItems: [
      { label: "Zona horaria", value: formatTimezoneSummary(settings.operationTimezone) },
      {
        label: "Horario predeterminado",
        value: formatOperationScheduleSummary(
          settings.defaultOperationStartTime,
          settings.defaultOperationEndTime,
        ),
      },
      { label: "Radio permitido", value: formatMeters(settings.defaultRadiusMeters) },
      {
        label: "Tolerancia de llegada",
        value: `${settings.defaultEarlyArrivalToleranceMinutes} min antes / ${settings.defaultLateArrivalToleranceMinutes} min después`,
      },
      { label: "Puntualidad WhatsApp", value: formatMinutes(settings.lateGraceMinutes) },
      {
        label: "Recordatorio",
        value: settings.confirmationReminderEnabled
          ? `${settings.confirmationReminderHoursBefore} h antes`
          : "Desactivado",
      },
    ],
  };
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

export function buildEmployeeCategoriesSummary(categories: EmployeeCategory[]) {
  const system = categories.filter((category) => category.isSystem);
  const customActive = categories.filter((category) => !category.isSystem && category.isActive);
  const customInactive = categories.filter((category) => !category.isSystem && !category.isActive);
  const chips = [...system, ...customActive].slice(0, 3).map((category) => category.name);

  return {
    summaryItems: [
      { label: "Base", value: `${system.length} categorías base` },
      { label: "Personalizadas", value: `${customActive.length} activas` },
      { label: "Inactivas", value: `${customInactive.length} inactivas` },
    ],
    chips,
  };
}

export function buildWorkScheduleSummary(schedule: CompanyWorkSchedule) {
  const enabledDays = schedule.days.filter((day) => day.isEnabled).length;

  return {
    summaryItems: [
      { label: "Zona horaria", value: schedule.timezone },
      { label: "Días laborables", value: `${enabledDays} de 7` },
      { label: "Horario", value: buildCompanySchedulePreviewLabel(schedule.days) },
    ],
  };
}

export function buildModulesSummary(modules: CompanyModule[]) {
  const enabled = modules.filter((module) => module.isEnabled);
  return [{ label: "Habilitados", value: `${enabled.length} de ${modules.length}` }];
}
