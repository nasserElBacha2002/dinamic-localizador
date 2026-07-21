import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("EmployeeCategorySelect wiring", () => {
  it("reuses shared category endpoint and gates create behind settings permission", () => {
    const selectFile = readFileSync(
      join(process.cwd(), "src/components/employees/EmployeeCategorySelect.tsx"),
      "utf8",
    );
    const formFile = readFileSync(
      join(process.cwd(), "src/components/employees/EmployeeForm.tsx"),
      "utf8",
    );

    assert.match(selectFile, /useCreateEmployeeCategory/);
    assert.match(selectFile, /useEmployeeCategories/);
    assert.match(selectFile, /Crear categoría/);
    assert.match(formFile, /company:settings:update/);
    assert.match(formFile, /EmployeeCategorySelect/);
    assert.match(formFile, /canCreate=\{canCreateCategories\}/);
  });
});
