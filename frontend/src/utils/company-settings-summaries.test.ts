import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  toOperationalSettingsUpdateInput,
  validateOperationalSettingsForm,
} from "./company-settings-validation";

describe("validateOperationalSettingsForm", () => {
  it("returns no errors for valid operational settings", () => {
    const errors = validateOperationalSettingsForm({
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: "150",
      defaultOperationStartTime: "20:30",
      defaultOperationEndTime: "03:00",
      defaultEarlyArrivalToleranceMinutes: "60",
      defaultLateArrivalToleranceMinutes: "15",
      lateGraceMinutes: "15",
      earlyLeaveToleranceMinutes: "15",
      pendingOperationExpirationHours: "12",
      confirmationReminderEnabled: true,
      confirmationReminderHoursBefore: "24",
    });
    assert.deepEqual(errors, []);
  });

  it("excludes checkout and manual correction fields from update payload", () => {
    const payload = toOperationalSettingsUpdateInput({
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: "150",
      defaultOperationStartTime: "20:30",
      defaultOperationEndTime: "03:00",
      defaultEarlyArrivalToleranceMinutes: "60",
      defaultLateArrivalToleranceMinutes: "15",
      lateGraceMinutes: "15",
      earlyLeaveToleranceMinutes: "15",
      pendingOperationExpirationHours: "12",
      confirmationReminderEnabled: true,
      confirmationReminderHoursBefore: "24",
    });

    assert.equal("requireCheckoutLocation" in payload, false);
    assert.equal("allowManualAttendanceCorrections" in payload, false);
    assert.equal("geofenceReviewMarginMeters" in payload, false);
  });
});

describe("company settings page UX structure", () => {
  it("uses inline operational section with collection cards", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );
    const sectionFile = readFileSync(
      join(process.cwd(), "src/pages/settings/components/CompanyOperationalSettingsSection.tsx"),
      "utf8",
    );

    assert.match(pageFile, /CompanyOperationalSettingsSection/);
    assert.match(sectionFile, /Guardar configuración/);
    assert.match(pageFile, /SettingsSummaryCard/);
    assert.match(pageFile, /CompanyAbsenceSettingsDialog/);
    assert.doesNotMatch(pageFile, /Módulos habilitados/);
    assert.doesNotMatch(pageFile, /isPlatformAdmin/);
  });
});
