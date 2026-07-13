import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATION_IMPORT_FORMAT_HELP,
  RECOMMENDED_IMPORT_TEMPLATE_HEADERS,
  downloadRecommendedImportTemplate,
} from "./operation-import-template";

describe("operation import template help", () => {
  it("uses Sucursal, Fecha for recommended downloadable template", () => {
    assert.deepEqual([...RECOMMENDED_IMPORT_TEMPLATE_HEADERS], ["Sucursal", "Fecha"]);
  });

  it("mentions Sucursal, Fecha and legacy PUNTO support", () => {
    assert.match(OPERATION_IMPORT_FORMAT_HELP, /Sucursal/);
    assert.match(OPERATION_IMPORT_FORMAT_HELP, /Fecha/);
    assert.match(OPERATION_IMPORT_FORMAT_HELP, /PUNTO/);
    assert.match(OPERATION_IMPORT_FORMAT_HELP, /ubicación existente/i);
    assert.match(OPERATION_IMPORT_FORMAT_HELP, /LOCAL, Formato y PROVEEDOR/);
    assert.match(OPERATION_IMPORT_FORMAT_HELP, /operación/i);
  });

  it("exports recommended template download helper", () => {
    assert.equal(typeof downloadRecommendedImportTemplate, "function");
  });
});
