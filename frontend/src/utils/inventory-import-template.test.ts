import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INVENTORY_IMPORT_FORMAT_HELP } from "./inventory-import-template";

describe("inventory import template help", () => {
  it("mentions Sucursal, Fecha and legacy PUNTO support", () => {
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /Sucursal/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /Fecha/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /PUNTO/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /ubicación existente/i);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /LOCAL, Formato y PROVEEDOR/);
    assert.match(INVENTORY_IMPORT_FORMAT_HELP, /operación/i);
  });
});
