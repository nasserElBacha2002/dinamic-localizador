import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const panelPath = join(
  process.cwd(),
  "src/pages/settings/components/absence/CompanyAbsenceSettingsTabPanel.tsx",
);
const pagePath = join(process.cwd(), "src/pages/settings/CompanySettingsPage.tsx");
const settingsDialogPath = join(
  process.cwd(),
  "src/pages/settings/components/absence/CompanyAbsenceSettingsDialog.tsx",
);
const policyDialogPath = join(
  process.cwd(),
  "src/pages/settings/components/absence/CompanyAbsenceTypePolicyDialog.tsx",
);
const integrationDialogPath = join(
  process.cwd(),
  "src/pages/settings/components/absence/CompanyAbsenceOperationalIntegrationDialog.tsx",
);

describe("Ausencias settings tab UX (phase 1)", () => {
  it("separates primary and advanced sections with collapsed diagnostics", () => {
    const panel = readFileSync(panelPath, "utf8");
    const primaryIndex = panel.indexOf("Configuración principal");
    const advancedIndex = panel.indexOf("Configuración avanzada");
    const diagnosticsToggle = panel.indexOf("Mostrar diagnóstico de archivos adjuntos");

    assert.ok(primaryIndex >= 0);
    assert.ok(advancedIndex > primaryIndex);
    assert.ok(diagnosticsToggle > advancedIndex);
    assert.match(panel, /diagnosticsOpened \? \(/);
  });

  it("keeps functional cards in primary and demotes calendar, integration and storage", () => {
    const panel = readFileSync(panelPath, "utf8");

    assert.match(panel, /title="Tipos y saldos"/);
    assert.match(panel, /title="Políticas"/);
    assert.doesNotMatch(panel, /Alertas de ausencias y cobertura/);
    assert.match(panel, /onOpenDialog\("absences"\)/);
    assert.match(panel, /onOpenDialog\("absenceTypePolicy"\)/);
    assert.doesNotMatch(panel, /onOpenDialog\("whatsappAlerts"\)/);
    assert.doesNotMatch(panel, /alertRecipientsQuery/);
    assert.match(panel, /onOpenDialog\("absenceCalendar"\)/);
    assert.match(panel, /onOpenDialog\("absenceOperationalIntegration"\)/);
    assert.match(panel, /summaryCardSecondary/);
    assert.doesNotMatch(panel, /\bGCS\b/);
    assert.doesNotMatch(panel, /Rollout/i);
    assert.doesNotMatch(panel, /migraci/i);
  });

  it("loads alert recipients only on the company tab, not absences", () => {
    const page = readFileSync(pagePath, "utf8");
    assert.match(page, /CompanyAbsenceSettingsTabPanel/);
    assert.match(page, /CompanyWhatsAppAlertsDialog/);
    assert.match(page, /useCompanyAlertRecipients\(companyTabEnabled && canRead\)/);
    assert.match(page, /setOpenDialog\("whatsappAlerts"\)/);
    assert.match(page, /title="Alertas y reporte diario"/);
  });

  it("does not expose internal type codes in saldos dialog UI", () => {
    const dialog = readFileSync(settingsDialogPath, "utf8");
    assert.doesNotMatch(dialog, /size="xs" c="dimmed">\s*\{row\.absenceTypeCode\}/);
  });

  it("shows calendar selector only for business-day types in policy dialog", () => {
    const dialog = readFileSync(policyDialogPath, "utf8");
    assert.match(dialog, /=== "BUSINESS_DAYS"/);
    assert.match(dialog, /No aplica \(días corridos\)/);
  });

  it("removes rollout and migration copy from operational integration dialog", () => {
    const dialog = readFileSync(integrationDialogPath, "utf8");
    assert.doesNotMatch(dialog, /migraci/i);
    assert.doesNotMatch(dialog, /069\/070/);
    assert.doesNotMatch(dialog, /piloto/i);
  });

  it("limits attachment storage health to settings editors and keeps it collapsed", () => {
    const panel = readFileSync(panelPath, "utf8");
    assert.match(panel, /\{canUpdate \? \(/);
    assert.match(panel, /storageHealthQuery/);
    assert.match(panel, /useDisclosure\(false\)/);
    assert.match(panel, /Mostrar diagnóstico de archivos adjuntos/);
  });
});
