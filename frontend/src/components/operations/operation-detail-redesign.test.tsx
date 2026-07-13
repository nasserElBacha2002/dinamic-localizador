import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("operation detail redesign", () => {
  it("uses unified team section and removes weekly schedule from detail page", async () => {
    const pageSource = await readFile(
      join(process.cwd(), "src/pages/operations/OperationDetailPage.tsx"),
      "utf8",
    );

    assert.match(pageSource, /OperationTeamSection/);
    assert.doesNotMatch(pageSource, /OperationWorkforceSection/);
    assert.doesNotMatch(pageSource, /OperationAssignmentsSection/);
    assert.doesNotMatch(pageSource, /WeeklySchedulePreview/);
    assert.match(pageSource, /Colaboradores asignados/);
    assert.match(pageSource, /title="Configuración"/);
  });

  it("opens workday detail in modal instead of inline table expansion", async () => {
    const sectionSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationScheduledWorkdaysSection.tsx"),
      "utf8",
    );
    const modalSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationWorkdayDetailModal.tsx"),
      "utf8",
    );

    assert.match(sectionSource, /OperationWorkdayDetailModal/);
    assert.match(sectionSource, /Ver detalle/);
    assert.doesNotMatch(sectionSource, /expanded/);
    assert.match(modalSource, /Detalle de jornada/);
    assert.match(modalSource, /Colaboradores de la jornada/);
  });

  it("prioritizes operational content before configuration on mobile layout", async () => {
    const layoutSource = await readFile(
      join(process.cwd(), "src/components/operations/operation-detail-layout.module.css"),
      "utf8",
    );

    assert.match(layoutSource, /"operational"\s+"data"/);
  });
});
