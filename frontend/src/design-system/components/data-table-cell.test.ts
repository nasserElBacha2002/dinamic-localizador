import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDataTableCellDisplay,
  resolveDataTableCellValue,
  type DataTableColumnLike,
} from "./data-table-cell";
import { DISPLAY_FALLBACK } from "../../utils/display-safe";

describe("data-table-cell helpers", () => {
  it("formatDataTableCellDisplay returns fallback for empty values", () => {
    assert.equal(formatDataTableCellDisplay(null), DISPLAY_FALLBACK);
    assert.equal(formatDataTableCellDisplay(undefined), DISPLAY_FALLBACK);
    assert.equal(formatDataTableCellDisplay(""), DISPLAY_FALLBACK);
    assert.equal(formatDataTableCellDisplay("Centro"), "Centro");
    assert.equal(formatDataTableCellDisplay(0), 0);
  });

  it("resolveDataTableCellValue does not crash when getValue throws", () => {
    const column: DataTableColumnLike<{ id: string }> = {
      key: "name",
      getValue: () => {
        throw new Error("boom");
      },
    };

    assert.equal(resolveDataTableCellValue({ id: "1" }, column), DISPLAY_FALLBACK);
  });

  it("resolveDataTableCellValue returns fallback for undefined getValue result", () => {
    const column: DataTableColumnLike<{ id: string }> = {
      key: "name",
      getValue: () => undefined,
    };

    assert.equal(resolveDataTableCellValue({ id: "1" }, column), DISPLAY_FALLBACK);
  });
});
