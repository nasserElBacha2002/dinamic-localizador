import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { normalizeCsvHeader, parseCsvContent } from "../utils/csv-parse";
import { createOperationImportDateTimeUtils } from "../utils/operation-import-datetime";
import { detectSpreadsheetFileType } from "../utils/spreadsheet-parse";

const defaultDateTimeUtils = createOperationImportDateTimeUtils({
  operationTimezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
  defaultOperationStartTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
  defaultOperationEndTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
});

describe("parseCsvContent", () => {
  it("parses comma-separated csv", () => {
    const parsed = parseCsvContent("tienda,fecha_inicio,fecha_fin\n495,25/06/2026 08:00,25/06/2026 18:00");
    assert.deepEqual(parsed.headers, ["tienda", "fecha_inicio", "fecha_fin"]);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0][0], "495");
  });

  it("parses semicolon-separated csv", () => {
    const parsed = parseCsvContent("tienda;fecha_inicio;fecha_fin\n495;25/06/2026 08:00;25/06/2026 18:00");
    assert.equal(parsed.headers[0], "tienda");
    assert.equal(parsed.rows[0][1], "25/06/2026 08:00");
  });

  it("parses client format csv", () => {
    const parsed = parseCsvContent("PUNTO,Fecha\n213,01/06/2026");
    assert.deepEqual(parsed.headers, ["PUNTO", "Fecha"]);
    assert.equal(parsed.rows[0][0], "213");
  });
});

describe("normalizeCsvHeader", () => {
  it("normalizes accents and spaces", () => {
    assert.equal(normalizeCsvHeader(" Fecha Inicio "), "fecha_inicio");
    assert.equal(normalizeCsvHeader("PUNTO"), "punto");
    assert.equal(normalizeCsvHeader("Fecha"), "fecha");
  });
});

describe("parseOperationImportDateValue", () => {
  it("parses latin date-only format", () => {
    const result = defaultDateTimeUtils.parseOperationImportDateValue("01/06/2026");
    assert.ok("parts" in result);
    assert.equal(result.parts.day, 1);
    assert.equal(result.parts.month, 6);
    assert.equal(result.parts.hasTime, false);
  });
});

describe("buildClientInventorySchedule", () => {
  it("uses default start and next-day end for date-only values", () => {
    const result = defaultDateTimeUtils.buildClientInventorySchedule("01/06/2026");
    assert.ok(!("error" in result));
    assert.match(result.scheduledStartDisplay, /20:30 \(default\)/);
    assert.match(result.scheduledEndDisplay, /03:00 día siguiente \(default\)/);
    assert.ok(new Date(result.scheduledEnd) > new Date(result.scheduledStart));
  });

  it("uses company-specific default start time when configured", () => {
    const customUtils = createOperationImportDateTimeUtils({
      operationTimezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
      defaultOperationStartTime: "21:15",
      defaultOperationEndTime: "04:30",
    });
    const result = customUtils.buildClientInventorySchedule("01/06/2026");
    assert.ok(!("error" in result));
    assert.match(result.scheduledStartDisplay, /21:15 \(default\)/);
    assert.match(result.scheduledEndDisplay, /04:30 día siguiente \(default\)/);
  });

  it("treats excel midnight as date-only and applies default start time", () => {
    const result = defaultDateTimeUtils.buildClientInventorySchedule("01/06/2026 00:00");
    assert.ok(!("error" in result));
    assert.match(result.scheduledStartDisplay, /20:30 \(default\)/);
  });
});

describe("localPartsToIso", () => {
  it("converts argentina local midnight without timezone error", () => {
    const result = defaultDateTimeUtils.localPartsToIso(2026, 6, 1, 20, 30);
    assert.ok("iso" in result);
  });

  it("converts next-day end time for overnight inventories", () => {
    const result = defaultDateTimeUtils.localPartsToIso(2026, 6, 2, 3, 0);
    assert.ok("iso" in result);
  });
});

describe("parseOperationImportDateTime", () => {
  it("parses latin datetime format", () => {
    const result = defaultDateTimeUtils.parseOperationImportDateTime("25/06/2026 08:00");
    assert.ok("iso" in result);
  });

  it("rejects invalid format", () => {
    const result = defaultDateTimeUtils.parseOperationImportDateTime("fecha-invalida");
    assert.ok("error" in result);
  });
});

describe("detectSpreadsheetFileType", () => {
  it("detects csv and xlsx", () => {
    assert.equal(detectSpreadsheetFileType("inventarios.csv"), "csv");
    assert.equal(detectSpreadsheetFileType("inventarios.xlsx"), "xlsx");
    assert.equal(detectSpreadsheetFileType("inventarios.pdf"), null);
  });
});
