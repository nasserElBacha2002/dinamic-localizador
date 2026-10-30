import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { validateCompanySettingsForm } from "../utils/company-settings-validation";

describe("company settings frontend module", () => {
  it("uses scoped API client for company settings module", () => {
    const apiFile = readFileSync(
      join(process.cwd(), "src/api/company-settings.api.ts"),
      "utf8",
    );
    assert.match(apiFile, /scopedApiClient/);
    assert.match(apiFile, /"settings"/);
    assert.doesNotMatch(apiFile, /apiClient\.(get|patch)\(\s*["'`]settings/);
  });

  it("scopes settings path with active company id", () => {
    const companyPathFile = readFileSync(
      join(process.cwd(), "src/api/company-path.ts"),
      "utf8",
    );
    assert.match(companyPathFile, /"settings"/);
  });

  it("includes companyId in settings query key and mutation invalidation", () => {
    const hooksFile = readFileSync(
      join(process.cwd(), "src/hooks/useCompanySettings.ts"),
      "utf8",
    );
    assert.match(hooksFile, /useOperationalQueryEnabled/);
    assert.match(hooksFile, /"company-settings", companyId/);
    assert.doesNotMatch(hooksFile, /getActiveCompanyId/);
  });

  it("shows settings nav for company:settings:update permission", () => {
    const navFile = readFileSync(join(process.cwd(), "src/utils/company-modules.ts"), "utf8");
    assert.match(navFile, /company:settings:update/);
    assert.match(navFile, /Configuración/);
  });

  it("uses unified operational and work schedule dialog for core company settings", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );
    const dialogFile = readFileSync(
      join(
        process.cwd(),
        "src/pages/settings/components/schedule/CompanyOperationalAndWorkScheduleDialog.tsx",
      ),
      "utf8",
    );
    const saveFile = readFileSync(
      join(
        process.cwd(),
        "src/pages/settings/components/schedule/company-operational-work-schedule-save.ts",
      ),
      "utf8",
    );

    assert.match(pageFile, /company:settings:update/);
    assert.match(pageFile, /CompanyOperationalAndWorkScheduleDialog/);
    assert.match(pageFile, /buildOperationalAndWorkScheduleCardSummary/);
    assert.match(dialogFile, /executeUnifiedSettingsSave/);
    assert.match(saveFile, /settingsMutate/);
    assert.match(saveFile, /scheduleMutate/);
  });

  it("validates invalid radius and minutes", () => {
    const errors = validateCompanySettingsForm({
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: "5",
      geofenceReviewMarginMeters: "",
      defaultOperationStartTime: "20:30",
      defaultOperationEndTime: "03:00",
      defaultEarlyArrivalToleranceMinutes: "60",
      defaultLateArrivalToleranceMinutes: "90",
      earlyLeaveToleranceMinutes: "-1",
      pendingOperationExpirationHours: "12",
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
      confirmationReminderEnabled: true,
      confirmationReminderHoursBefore: "24",
    });
    assert.ok(errors.length >= 2);
  });

  it("includes operation default fields in operational save payload", () => {
    const validationFile = readFileSync(
      join(process.cwd(), "src/utils/company-settings-validation.ts"),
      "utf8",
    );
    assert.match(validationFile, /toOperationalSettingsUpdateInput/);
    assert.match(validationFile, /defaultEarlyArrivalToleranceMinutes/);
    assert.match(validationFile, /defaultLateArrivalToleranceMinutes/);
    assert.match(validationFile, /defaultOperationStartTime/);
    assert.match(validationFile, /defaultOperationEndTime/);
  });

  it("calls updateCompanySettings from unified save orchestration", () => {
    const saveFile = readFileSync(
      join(
        process.cwd(),
        "src/pages/settings/components/schedule/company-operational-work-schedule-save.ts",
      ),
      "utf8",
    );
    assert.match(saveFile, /toOperationalSettingsUpdateInput/);
    assert.match(saveFile, /settingsMutate/);
  });
});
