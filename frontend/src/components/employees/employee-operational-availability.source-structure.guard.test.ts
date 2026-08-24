import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("frontend absence operational surfaces", () => {
  const table = readFileSync(
    resolve(process.cwd(), "src/components/operations/OperationEmployeeTable.tsx"),
    "utf8",
  );
  const employeeSummaryTab = readFileSync(
    resolve(process.cwd(), "src/pages/employees/tabs/EmployeeSummaryTab.tsx"),
    "utf8",
  );
  const availabilityCard = readFileSync(
    resolve(process.cwd(), "src/components/employees/EmployeeOperationalAvailabilityCard.tsx"),
    "utf8",
  );

  it("renders absence badges and deep-links", () => {
    assert.match(table, /absenceBadges/);
    assert.match(table, /Ver ausencia/);
    assert.match(table, /Ver conflicto/);
    assert.match(table, /Ver colaborador/);
  });

  it("shows operational availability on employee detail", () => {
    assert.match(employeeSummaryTab, /Disponibilidad operacional/);
    assert.match(employeeSummaryTab, /EmployeeOperationalAvailabilityCard/);
    assert.match(availabilityCard, /operational-availability/);
    assert.match(availabilityCard, /Conflictos abiertos/);
  });
});
