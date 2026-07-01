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
    assert.match(navFile, /Configuración de empresa/);
  });

  it("disables save when user lacks company:settings:update", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );
    assert.match(pageFile, /company:settings:update/);
    assert.match(pageFile, /Guardar cambios/);
    assert.match(pageFile, /!hasChanges \|\| !isValid/);
  });

  it("validates invalid radius and minutes", () => {
    const errors = validateCompanySettingsForm({
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: "5",
      lateGraceMinutes: "300",
      earlyLeaveToleranceMinutes: "-1",
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
    });
    assert.ok(errors.length >= 3);
  });

  it("calls updateCompanySettings on save", () => {
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx"),
      "utf8",
    );
    assert.match(pageFile, /updateMutation\.mutateAsync/);
  });
});
