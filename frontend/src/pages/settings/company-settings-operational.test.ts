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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("CompanyOperationalSettingsSection", () => {
  it("renders inline editable fields without dialogs", () => {
    const sectionFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/CompanyOperationalSettingsSection.tsx"),
      "utf8",
    );

    assert.match(sectionFile, /Configuración operativa/);
    assert.match(sectionFile, /Zona horaria operativa/);
    assert.match(sectionFile, /Radio permitido por defecto \(m\)/);
    assert.match(sectionFile, /Horario de inicio por defecto/);
    assert.match(sectionFile, /Horario de fin por defecto/);
    assert.match(sectionFile, /Tolerancia de llegada temprana para operaciones \(min\)/);
    assert.match(sectionFile, /Tolerancia de llegada tardía para operaciones \(min\)/);
    assert.match(sectionFile, /Tolerancia de puntualidad WhatsApp \(min\)/);
    assert.match(sectionFile, /Tolerancia de salida anticipada WhatsApp \(min\)/);
    assert.doesNotMatch(sectionFile, /Modal/);
    assert.doesNotMatch(sectionFile, /SettingsDialog/);
  });

  it("uses aligned SettingsFormField wrappers with helper text on every field", () => {
    const sectionFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/CompanyOperationalSettingsSection.tsx"),
      "utf8",
    );
    const activeSection = sectionFile.replace(/{\/\*[\s\S]*?\*\/}/g, "");

    assert.equal((activeSection.match(/<SettingsFormField/g) ?? []).length, 9);
    assert.match(activeSection, /description="Zona horaria usada por operaciones y reportes\."/);
    assert.match(activeSection, /description="Ventana configurable por empresa antes del inicio del inventario\."/);
    assert.match(sectionFile, /description="Validación del mensaje “Llegué”\."/);
    assert.match(sectionFile, /description="Validación del mensaje “Terminé”\."/);
    assert.match(sectionFile, /getOperationTimezoneOptions/);
    assert.match(sectionFile, /OperationTimeInput/);
    assert.match(sectionFile, /searchable/);
    assert.match(sectionFile, /hideControls/);
  });

  it("uses dirty-aware save and discard actions", () => {
    const sectionFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/CompanyOperationalSettingsSection.tsx"),
      "utf8",
    );

    assert.match(sectionFile, /Guardar configuración/);
    assert.match(sectionFile, /Descartar cambios/);
    assert.match(sectionFile, /disabled=\{!hasChanges/);
    assert.match(sectionFile, /handleReset/);
  });

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
    ]);
    assert.equal(payload.lateGraceMinutes, 20);
    assert.equal("requireCheckoutLocation" in payload, false);
    assert.equal("allowManualAttendanceCorrections" in payload, false);
  });

  it("tracks dirty state across operation and WhatsApp fields", () => {
    const baseline = toOperationalSettingsFormValues(createMockSettings());
    const changed = { ...baseline, defaultLateArrivalToleranceMinutes: "30" };
    assert.equal(operationalSettingsEqual(baseline, changed), false);
  });
});

describe("Company settings page layout", () => {
  it("uses one operational section and collection cards only", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );

    assert.match(pageFile, /CompanyOperationalSettingsSection/);
    assert.match(pageFile, /SettingsSummaryCard/);
    assert.match(pageFile, /Gestionar ausencias/);
    assert.match(pageFile, /Gestionar tipos/);
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

  it("opens absence and location dialogs from summary cards", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );

    assert.match(pageFile, /CompanyAbsenceSettingsDialog/);
    assert.match(pageFile, /CompanyLocationTypesDialog/);
    assert.match(pageFile, /setOpenDialog\("absences"\)/);
    assert.match(pageFile, /setOpenDialog\("locationTypes"\)/);
    assert.doesNotMatch(pageFile, /CompanyInventoryOperationSettingsDialog/);
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
  it("StoreForm still loads location types from API hook", () => {
    const storeFormFile = readFileSync(
      join(process.cwd(), "src/components/stores/StoreForm.tsx"),
      "utf8",
    );
    assert.match(storeFormFile, /useCompanyLocationTypes/);
    assert.doesNotMatch(storeFormFile, /STORE_FORMATS/);
  });

  it("inventory create defaults still use operation tolerances", () => {
    const defaultsFile = readFileSync(
      join(process.cwd(), "src/utils/inventory-create-defaults.ts"),
      "utf8",
    );
    assert.match(defaultsFile, /defaultEarlyArrivalToleranceMinutes/);
    assert.match(defaultsFile, /defaultLateArrivalToleranceMinutes/);
  });
});
