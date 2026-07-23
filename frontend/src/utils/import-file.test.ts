import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeCsvFormulaInjection,
  resolveImportNotification,
} from "./import-file";
import type { ImportExecuteResult } from "../types/import";

describe("import-file helpers", () => {
  it("escapes formula injection prefixes", () => {
    assert.equal(escapeCsvFormulaInjection("=CMD()"), "'=CMD()");
    assert.equal(escapeCsvFormulaInjection("+1"), "'+1");
    assert.equal(escapeCsvFormulaInjection("-1"), "'-1");
    assert.equal(escapeCsvFormulaInjection("@sum"), "'@sum");
    assert.equal(escapeCsvFormulaInjection("normal"), "normal");
  });

  it("classifies complete / partial / failed notifications", () => {
    const base: ImportExecuteResult = {
      entityType: "services",
      summary: {
        totalRows: 2,
        processedRows: 2,
        created: 2,
        updated: 0,
        rejected: 0,
        durationMs: 1,
      },
      rows: [],
      fileErrors: [],
    };

    assert.equal(resolveImportNotification(base).color, "green");
    assert.equal(
      resolveImportNotification({
        ...base,
        summary: { ...base.summary, created: 1, rejected: 1 },
      }).color,
      "yellow",
    );
    assert.equal(
      resolveImportNotification({
        ...base,
        summary: { ...base.summary, created: 0, rejected: 2 },
      }).color,
      "red",
    );
  });
});
