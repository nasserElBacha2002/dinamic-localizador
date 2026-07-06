import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsv, escapeCsvValue } from "./csv";

describe("escapeCsvValue", () => {
  it("prefixes formula-like values to prevent CSV injection", () => {
    assert.equal(escapeCsvValue("=SUM(A1)"), `"'=SUM(A1)"`);
    assert.equal(escapeCsvValue("+5411"), `"'+5411"`);
  });

  it("escapes commas and quotes", () => {
    assert.equal(escapeCsvValue('Servicio "Centro"'), '"Servicio ""Centro"""');
  });
});

describe("buildCsv", () => {
  it("builds UTF-8 CSV with headers", () => {
    const csv = buildCsv(["Empleado", "Teléfono"], [["Juan", "+5411"]]);
    assert.match(csv, /^\uFEFFEmpleado,Teléfono/);
    assert.match(csv, /Juan,"'\+5411"/);
  });
});
