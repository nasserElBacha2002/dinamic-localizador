import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { servicesImportStrategy } from "../imports/strategies/services.strategy";
import { employeesImportStrategy } from "../imports/strategies/employees.strategy";

describe("services import strategy preview", () => {
  it("rejects missing required columns structurally", async () => {
    setupUnitTestEnv();
    const csv = "Nombre,Latitud\nSucursal A,-34.6\n";
    const result = await servicesImportStrategy.preview(
      "11111111-1111-1111-1111-111111111111",
      Buffer.from(csv, "utf8"),
      "services.csv",
    );
    assert.ok(result.fileErrors.some((error) => error.includes("Longitud")));
    assert.equal(result.rows.length, 0);
    assert.equal(result.summary.canConfirm, false);
  });
});

describe("employees import strategy preview", () => {
  it("rejects empty files", async () => {
    setupUnitTestEnv();
    await assert.rejects(
      () =>
        employeesImportStrategy.preview(
          "11111111-1111-1111-1111-111111111111",
          Buffer.from("", "utf8"),
          "employees.csv",
        ),
      (error: unknown) => error instanceof Error,
    );
  });
});
