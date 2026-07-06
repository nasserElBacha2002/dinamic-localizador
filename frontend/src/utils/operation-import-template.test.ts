import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INVENTORY_IMPORT_FORMAT_HELP,
  RECOMMENDED_IMPORT_TEMPLATE_HEADERS,
  downloadRecommendedImportTemplate,
} from "./operation-import-template";

describe("inventory import template help", () => {
  it("uses Sucursal, Fecha for recommended downloadable template", () => {
    assert.deepEqual([...RECOMMENDED_IMPORT_TEMPLATE_HEADERS], ["Sucursal", "Fecha"]);
  });

  it("mentions Sucursal, Fecha and legacy PUNTO support", () => {
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /Sucursal/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /Fecha/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /PUNTO/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /ubicación existente/i);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /LOCAL, Formato y PROVEEDOR/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /operación/i);
  });

  it("exports recommended template download helper", () => {
    assert.equal(typeof downloadRecommendedImportTemplate, "function");
  });
});
