import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
  CLIENT_IMPORT_TEMPLATE_HEADERS,
  OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS,
  OPERATION_CANONICAL_TEMPLATE_FILE_NAME,
  OPERATION_ONE_TIME_DOWNLOAD_TEMPLATE_HEADERS,
  OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS,
  OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS,
} from "../constants/operation-import";

describe("operation import template constants", () => {
  it("recommends Sucursal, Fecha for downloadable client template", () => {
    assert.deepEqual([...CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS], ["Sucursal", "Fecha"]);
  });

  it("keeps PUNTO, Fecha as legacy accepted template headers", () => {
    assert.deepEqual([...CLIENT_IMPORT_TEMPLATE_HEADERS], ["PUNTO", "Fecha"]);
  });

  it("defines the unified canonical operations template", () => {
    assert.equal(OPERATION_CANONICAL_TEMPLATE_FILE_NAME, "plantilla-importacion-operaciones.csv");
    assert.ok(OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS.includes("Tipo"));
    assert.ok(OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS.includes("Fecha"));
    assert.ok(OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS.includes("Vigencia desde"));
    assert.ok(OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS.includes("Turno codigo"));
  });

  it("keeps legacy variant templates for backward-compatible downloads", () => {
    assert.deepEqual([...OPERATION_ONE_TIME_DOWNLOAD_TEMPLATE_HEADERS], [
      "Sucursal",
      "Fecha",
      "tolerancia_temprana",
      "tolerancia_tardia",
    ]);
    assert.ok(OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS.includes("vigencia_desde"));
    assert.ok(OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS.includes("origen_horario"));
    assert.ok(!OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS.includes("Fecha"));
    assert.ok(OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS.includes("modo_horario"));
    assert.ok(OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS.includes("turno_codigo"));
    assert.ok(!OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS.includes("origen_horario"));
  });
});
