import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMPORT_MISSING_DATE_MESSAGE,
  IMPORT_MISSING_LOCATION_MESSAGE,
} from "../constants/operation-import";
import {
  mapImportHeaders,
  normalizeImportColumnName,
  resolveImportHeaderColumn,
} from "./operation-import-headers";

describe("inventory import headers", () => {
  it("normalizes import column names", () => {
    assert.equal(normalizeImportColumnName(" PUNTO "), "punto");
    assert.equal(normalizeImportColumnName("Ubicación"), "ubicacion");
    assert.equal(normalizeImportColumnName("Fecha de inicio"), "fecha_de_inicio");
    assert.equal(normalizeImportColumnName("fecha_inicio"), "fecha_inicio");
  });

  it("resolves location and date aliases", () => {
    assert.equal(resolveImportHeaderColumn("PUNTO"), "location");
    assert.equal(resolveImportHeaderColumn("Sucursal"), "location");
    assert.equal(resolveImportHeaderColumn("Ubicacion"), "location");
    assert.equal(resolveImportHeaderColumn("tienda"), "location");
    assert.equal(resolveImportHeaderColumn("Fecha"), "fecha");
    assert.equal(resolveImportHeaderColumn("fecha_inicio"), "fecha_inicio");
    assert.equal(resolveImportHeaderColumn("Fecha de fin"), "fecha_fin");
    assert.equal(resolveImportHeaderColumn("LOCAL"), "local");
  });

  it("detects legacy PUNTO + Fecha as client format", () => {
    const result = mapImportHeaders(["PUNTO", "Fecha"]);
    assert.equal(result.format, "client");
    assert.deepEqual(result.mapped, ["location", "fecha"]);
  });

  it("detects Sucursal + Fecha as client format", () => {
    const result = mapImportHeaders(["Sucursal", "Fecha"]);
    assert.equal(result.format, "client");
  });

  it("detects Ubicación + Fecha as client format", () => {
    const result = mapImportHeaders(["Ubicación", "Fecha"]);
    assert.equal(result.format, "client");
  });

  it("detects Ubicacion + Fecha as client format", () => {
    const result = mapImportHeaders(["Ubicacion", "Fecha"]);
    assert.equal(result.format, "client");
  });

  it("detects extended legacy format with generic location aliases", () => {
    const tienda = mapImportHeaders(["tienda", "fecha_inicio", "fecha_fin"]);
    assert.equal(tienda.format, "legacy");

    const ubicacion = mapImportHeaders(["ubicacion", "fecha_inicio", "fecha_fin"]);
    assert.equal(ubicacion.format, "legacy");

    const sucursal = mapImportHeaders(["Sucursal", "fecha_inicio", "fecha_fin"]);
    assert.equal(sucursal.format, "legacy");
  });

  it("reports missing location column", () => {
    const result = mapImportHeaders(["Fecha"]);
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.includes(IMPORT_MISSING_LOCATION_MESSAGE));
  });

  it("reports missing date column", () => {
    const result = mapImportHeaders(["PUNTO"]);
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.includes(IMPORT_MISSING_DATE_MESSAGE));
  });
});
