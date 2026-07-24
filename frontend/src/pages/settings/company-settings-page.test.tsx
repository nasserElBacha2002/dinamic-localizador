import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyAbsenceSetting } from "../../types/company-absence-settings";
import type { CompanyLocationType } from "../../types/company-location-type";
import type { CompanySettings } from "../../types/company-settings";
import {
  buildAbsenceSummary,
  buildOperationalSettingsSummary,
  buildLocationTypesSummary,
  buildWhatsAppSummary,
} from "./company-settings-summaries";

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

describe("Company settings summaries", () => {
  it("builds operational summary from company settings", () => {
    const summary = buildOperationalSettingsSummary(createMockSettings());
    const schedule = summary.summaryItems.find((item) => item.label === "Horario predeterminado");
    assert.equal(schedule?.value, "20:30 a 03:00");
  });

  it("builds WhatsApp summary separately from operation tolerances", () => {
    const settings = createMockSettings({
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 20,
      defaultLateArrivalToleranceMinutes: 90,
    });
    const summary = buildWhatsAppSummary(settings);
    assert.ok(summary.some((item) => item.value === "15 min"));
    assert.ok(summary.some((item) => item.value === "20 min"));
  });

  it("builds absence summary with configured and auto-assigned counts", () => {
    const settings: CompanyAbsenceSetting[] = [
      {
        absenceTypeCode: "VACATION",
        absenceTypeName: "Vacaciones",
        isActive: true,
        defaultAnnualDays: 14,
        autoAssignOnEmployeeCreate: true,
      },
      {
        absenceTypeCode: "STUDY_DAY",
        absenceTypeName: "Día de estudio",
        isActive: true,
        defaultAnnualDays: 2.5,
        autoAssignOnEmployeeCreate: true,
      },
      {
        absenceTypeCode: "OTHER",
        absenceTypeName: "Otro",
        isActive: false,
        defaultAnnualDays: 0,
        autoAssignOnEmployeeCreate: false,
      },
    ];

    const summary = buildAbsenceSummary(settings);
    assert.ok(summary.summaryItems.some((item) => item.value === "2 tipos configurados"));
    assert.ok(summary.summaryItems.some((item) => item.value === "2 se asignan automáticamente"));
  });

  it("builds location types summary with active/inactive counts", () => {
    const types: CompanyLocationType[] = [
      {
        id: "1",
        companyId: "company-1",
        name: "Supermercado",
        code: "SUPER",
        sortOrder: 1,
        isActive: true,
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "2",
        companyId: "company-1",
        name: "Depósito",
        code: "DEPOSITO",
        sortOrder: 2,
        isActive: false,
        createdAt: "",
        updatedAt: "",
      },
    ];

    const summary = buildLocationTypesSummary(types);
    assert.ok(summary.summaryItems.some((item) => item.value === "1 activos"));
    assert.ok(summary.summaryItems.some((item) => item.value === "1 inactivos"));
    assert.deepEqual(summary.chips, ["Supermercado"]);
  });
});
