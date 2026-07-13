import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("operation team dialog simplification", () => {
  it("removes metric cards and inline assignment form from team section", async () => {
    const sectionSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationTeamSection.tsx"),
      "utf8",
    );

    assert.doesNotMatch(sectionSource, /OperationalSummaryMetrics/);
    assert.doesNotMatch(sectionSource, /EmployeeSearchAutocomplete/);
    assert.match(sectionSource, /Administrar equipo/);
    assert.match(sectionSource, /OperationTeamManageDialog/);
    assert.match(sectionSource, /currentlyAssignedEmployeeIds/);
  });

  it("provides unified manage dialog with individual and group tabs", async () => {
    const dialogSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationTeamManageDialog.tsx"),
      "utf8",
    );

    assert.match(dialogSource, /Agregar individualmente/);
    assert.match(dialogSource, /Agregar desde grupos/);
    assert.match(dialogSource, /OperationIndividualAssignmentPanel/);
    assert.match(dialogSource, /WorkTeamAssignmentPanel/);
  });

  it("keeps compact employee table without type column", async () => {
    const tableSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationEmployeeTable.tsx"),
      "utf8",
    );

    assert.doesNotMatch(tableSource, /header: "Tipo"/);
    assert.match(tableSource, /buildEmployeeSecondaryLine/);
    assert.match(tableSource, /Menu/);
  });
});
