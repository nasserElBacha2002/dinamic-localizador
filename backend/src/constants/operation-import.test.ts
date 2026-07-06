import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
  CLIENT_IMPORT_TEMPLATE_HEADERS,
} from "../constants/operation-import";

describe("inventory import template constants", () => {
  it("recommends Sucursal, Fecha for downloadable client template", () => {
    assert.deepEqual([...CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS], ["Sucursal", "Fecha"]);
  });

  it("keeps PUNTO, Fecha as legacy accepted template headers", () => {
    assert.deepEqual([...CLIENT_IMPORT_TEMPLATE_HEADERS], ["PUNTO", "Fecha"]);
  });
});
