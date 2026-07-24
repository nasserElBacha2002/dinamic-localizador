import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { CompanySettings } from "../../types/company-settings";
import {
  operationalSettingsEqual,
  toOperationalSettingsFormValues,
  toOperationalSettingsUpdateInput,
} from "../../utils/company-settings-validation";
import { buildOperationalSettingsSummary } from "./company-settings-summaries";

function createMockSettings(overrides: Partial<CompanySettings> = {}): CompanySettings {
  return {
    companyId: "company-1",
    operationTimezone: "America/Argentina/Buenos_Aires",
    defaultRadiusMeters: 180,
    lateGraceMinutes: 15,
    earlyLeaveToleranceMinutes: 15,
    requireCheckoutLocation: true,
    allowManualAttendanceCorrections: false,
    defaultEarlyArrivalToleranceMinutes: 60,
    defaultLateArrivalToleranceMinutes: 15,
    defaultOperationStartTime: "20:30",
    defaultOperationEndTime: "03:00",
    geofenceReviewMarginMeters: 30,
    confirmationReminderEnabled: true,
    confirmationReminderHoursBefore: 24,
    pendingOperationExpirationHours: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("OperationalSettingsForm", () => {
  it("renders editable fields without page-level save actions", () => {
    const formFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/OperationalSettingsForm.tsx"),
      "utf8",
    );

    assert.match(formFile, /Zona horaria operativa/);
    assert.match(formFile, /Radio permitido por defecto \(m\)/);
    assert.match(formFile, /Horario de inicio por defecto/);
    assert.match(formFile, /Horario de fin por defecto/);
    assert.match(formFile, /Tolerancia de llegada temprana para operaciones \(min\)/);
    assert.match(formFile, /Tolerancia de llegada tardía para operaciones \(min\)/);
    assert.match(formFile, /Tolerancia de puntualidad WhatsApp \(min\)/);
    assert.match(formFile, /Tolerancia de salida anticipada WhatsApp \(min\)/);
    assert.doesNotMatch(formFile, /Modal/);
    assert.doesNotMatch(formFile, /SettingsDialog/);
    assert.doesNotMatch(formFile, /Guardar configuración/);
  });

  it("uses aligned SettingsFormField wrappers with helper text on every field", () => {
    const formFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/OperationalSettingsForm.tsx"),
      "utf8",
    );
    const activeSection = formFile.replace(/{\/\*[\s\S]*?\*\/}/g, "");

    assert.equal((activeSection.match(/<SettingsFormField/g) ?? []).length, 10);
    assert.match(activeSection, /description="Zona horaria usada por operaciones y reportes\."/);
    assert.match(
      activeSection,
      /description="Ventana configurable por empresa antes del inicio de la operación\."/,
    );
    assert.match(formFile, /description="Validación del mensaje “Llegué”\."/);
    assert.match(formFile, /description="Validación del mensaje “Terminé”\."/);
    assert.match(
      formFile,
      /description="Cantidad de horas después del fin de una operación durante las que un empleado todavía puede registrar su salida\."/,
    );
    assert.match(formFile, /Vencimiento de salida pendiente \(horas\)/);
    assert.match(formFile, /getOperationTimezoneOptions/);
    assert.match(formFile, /OperationTimeInput/);
    assert.match(formFile, /searchable/);
    assert.match(formFile, /hideControls/);
  });
});

describe("CompanyOperationalSettingsDialog", () => {
  it("uses SettingsDialog with dirty-aware save and unsaved-close protection", () => {
    const dialogFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/CompanyOperationalSettingsDialog.tsx"),
      "utf8",
    );

    assert.match(dialogFile, /SettingsDialog/);
    assert.match(dialogFile, /OperationalSettingsForm/);
    assert.match(dialogFile, /Guardar configuración/);
    assert.match(dialogFile, /saveDisabled=\{!canUpdate \|\| !hasChanges \|\| !isValid\}/);
    assert.match(dialogFile, /window\.confirm/);
    assert.match(dialogFile, /cambios sin guardar/);
  });
});

describe("Operational settings mapping", () => {
  it("builds PATCH payload with only operational fields", () => {
    const formValues = toOperationalSettingsFormValues(createMockSettings());
    const payload = toOperationalSettingsUpdateInput({
      ...formValues,
      lateGraceMinutes: "20",
    });

    assert.deepEqual(Object.keys(payload).sort(), [
      "confirmationReminderEnabled",
      "confirmationReminderHoursBefore",
      "defaultEarlyArrivalToleranceMinutes",
      "defaultLateArrivalToleranceMinutes",
      "defaultOperationEndTime",
      "defaultOperationStartTime",
      "defaultRadiusMeters",
      "earlyLeaveToleranceMinutes",
      "lateGraceMinutes",
      "operationTimezone",
      "pendingOperationExpirationHours",
    ]);
    assert.equal(payload.lateGraceMinutes, 20);
    assert.equal(payload.pendingOperationExpirationHours, 12);
    assert.equal("requireCheckoutLocation" in payload, false);
    assert.equal("allowManualAttendanceCorrections" in payload, false);
  });

  it("tracks dirty state across operation and WhatsApp fields", () => {
    const baseline = toOperationalSettingsFormValues(createMockSettings());
    const changed = { ...baseline, defaultLateArrivalToleranceMinutes: "30" };
    assert.equal(operationalSettingsEqual(baseline, changed), false);
  });

  it("builds operational summary for the settings card", () => {
    const summary = buildOperationalSettingsSummary(
      createMockSettings({
        defaultOperationStartTime: "21:07",
        defaultOperationEndTime: "02:00",
      }),
    );

    assert.ok(summary.summaryItems.some((item) => item.label === "Zona horaria"));
    assert.ok(
      summary.summaryItems.some(
        (item) => item.label === "Horario predeterminado" && item.value === "21:07 a 02:00",
      ),
    );
    assert.ok(summary.summaryItems.some((item) => item.value === "180 m"));
    assert.ok(
      summary.summaryItems.some(
        (item) =>
          item.label === "Tolerancia de llegada" &&
          item.value === "60 min antes / 15 min después",
      ),
    );
    assert.ok(summary.summaryItems.some((item) => item.value === "24 h antes"));
  });
});

describe("Company settings page layout", () => {
  it("uses operational summary card and collection cards only", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );

    assert.match(pageFile, /buildOperationalSettingsSummary/);
    assert.match(pageFile, /CompanyOperationalSettingsDialog/);
    assert.match(pageFile, /SettingsSummaryCard/);
    assert.match(pageFile, /Gestionar configuración operativa/);
    assert.match(pageFile, /Gestionar ausencias/);
    assert.match(pageFile, /Gestionar formatos/);
    assert.doesNotMatch(pageFile, /CompanyOperationalSettingsSection/);
    assert.doesNotMatch(pageFile, /Datos generales/);
    assert.doesNotMatch(pageFile, /Inventarios \/ operaciones/);
    assert.doesNotMatch(pageFile, /Asistencia \/ WhatsApp/);
    assert.doesNotMatch(pageFile, /Correcciones manuales/);
    assert.doesNotMatch(pageFile, /Check-out/);
    assert.doesNotMatch(pageFile, /Módulos habilitados/);
    assert.doesNotMatch(pageFile, /requireCheckoutLocation/);
    assert.doesNotMatch(pageFile, /allowManualAttendanceCorrections/);
    assert.doesNotMatch(pageFile, /useCompanyModules/);
    assert.doesNotMatch(pageFile, /isPlatformAdmin/);
  });

  it("opens operational and other dialogs from summary cards", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );

    assert.match(pageFile, /CompanyOperationalSettingsDialog/);
    assert.match(pageFile, /CompanyAbsenceSettingsDialog/);
    assert.match(pageFile, /CompanyLocationTypesDialog/);
    assert.match(pageFile, /CompanyWeeklyScheduleDialog/);
    assert.match(pageFile, /setOpenDialog\("operational"\)/);
    assert.match(pageFile, /setOpenDialog\("absences"\)/);
    assert.match(pageFile, /setOpenDialog\("locationTypes"\)/);
    assert.match(pageFile, /setOpenDialog\("workSchedule"\)/);
    assert.doesNotMatch(pageFile, /CompanyWeeklyScheduleSection/);
    assert.doesNotMatch(pageFile, /CompanyOperationOperationSettingsDialog/);
  });
});

describe("Company modules permissions", () => {
  it("keeps module management out of company settings page", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );

    assert.doesNotMatch(pageFile, /useCompanyModules/);
    assert.doesNotMatch(pageFile, /useUpdateCompanyModules/);
    assert.doesNotMatch(pageFile, /Módulos habilitados/);
    assert.doesNotMatch(pageFile, /Gestionar módulos/);
  });

  it("restricts module PATCH to platform admin in backend route", () => {
    const routesFile = readFileSync(
      join(process.cwd(), "../backend/src/routes/company.routes.ts"),
      "utf8",
    );
    const serviceFile = readFileSync(
      join(process.cwd(), "../backend/src/services/company-module.service.ts"),
      "utf8",
    );

    assert.match(routesFile, /requirePlatformAdmin/);
    assert.match(serviceFile, /PLATFORM_ADMIN_REQUIRED/);
  });

  it("shows platform companies nav only for platform admin", () => {
    const navFile = readFileSync(join(process.cwd(), "src/utils/company-modules.ts"), "utf8");
    assert.match(navFile, /if \(isPlatformAdmin\)/);
    assert.match(navFile, /Empresas de plataforma/);
    assert.doesNotMatch(navFile, /Módulos habilitados/);
  });
});

describe("Regression: related modules still use company settings APIs", () => {
  it("ServiceForm still loads location types from API hook", () => {
    const serviceFormFile = readFileSync(
      join(process.cwd(), "src/components/services/ServiceForm.tsx"),
      "utf8",
    );
    assert.match(serviceFormFile, /useCompanyLocationTypes/);
    assert.doesNotMatch(serviceFormFile, /STORE_FORMATS/);
  });

  it("operation create defaults still use operation tolerances", () => {
    const defaultsFile = readFileSync(
      join(process.cwd(), "src/utils/operation-create-defaults.ts"),
      "utf8",
    );
    assert.match(defaultsFile, /defaultEarlyArrivalToleranceMinutes/);
    assert.match(defaultsFile, /defaultLateArrivalToleranceMinutes/);
  });
});
