import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCanonicalOperationImportHeaders,
  parseCanonicalOperationImportRowType,
} from "./operation-import-canonical";
import { parseRecurringImportDayFlag } from "./operation-import-recurring";

describe("operation import canonical format", () => {
  it("detects canonical headers by Tipo + Fecha + vigencia_desde", () => {
    assert.equal(
      isCanonicalOperationImportHeaders([
        "Sucursal",
        "Tipo",
        "Fecha",
        "Vigencia desde",
        "Vigencia hasta",
      ]),
      true,
    );
    assert.equal(isCanonicalOperationImportHeaders(["Sucursal", "Fecha"]), false);
    assert.equal(isCanonicalOperationImportHeaders(["Sucursal", "vigencia_desde"]), false);
  });

  it("parses user-facing row types and technical aliases", () => {
    assert.deepEqual(parseCanonicalOperationImportRowType("PUNTUAL"), {
      type: "PUNTUAL",
      error: null,
    });
    assert.deepEqual(parseCanonicalOperationImportRowType("fija"), { type: "FIJA", error: null });
    assert.deepEqual(parseCanonicalOperationImportRowType("MULTI_TURNO"), {
      type: "MULTI_TURNO",
      error: null,
    });
    assert.deepEqual(parseCanonicalOperationImportRowType("ONE_TIME"), {
      type: "PUNTUAL",
      error: null,
    });
    assert.deepEqual(parseCanonicalOperationImportRowType("MULTI_SHIFT"), {
      type: "MULTI_TURNO",
      error: null,
    });
    assert.ok(parseCanonicalOperationImportRowType("").error);
    assert.ok(parseCanonicalOperationImportRowType("OTRO").error);
  });
});

describe("parseRecurringImportDayFlag SI/NO and 1/0", () => {
  it("accepts enabled aliases", () => {
    for (const value of ["1", "SI", "SÍ", "si", "TRUE", "X", "YES", "Y"]) {
      assert.equal(parseRecurringImportDayFlag(value).value, true);
      assert.equal(parseRecurringImportDayFlag(value).error, null);
    }
  });

  it("accepts disabled aliases", () => {
    for (const value of ["0", "NO", "no", "FALSE", ""]) {
      assert.equal(parseRecurringImportDayFlag(value).value, false);
      assert.equal(parseRecurringImportDayFlag(value).error, null);
    }
  });

  it("rejects unknown day values", () => {
    const parsed = parseRecurringImportDayFlag("quizás");
    assert.equal(parsed.value, false);
    assert.ok(parsed.error);
  });
});
