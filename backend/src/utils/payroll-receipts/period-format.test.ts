import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPayrollReceiptPeriod } from "./period-format";
import { parsePayrollReceiptPeriodMessage } from "./period-parser";
import { buildPayrollReceiptAvailableTemplateVariables } from "./available-template-variables";

describe("formatPayrollReceiptPeriod", () => {
  it("formats month and year as MM/YY", () => {
    assert.equal(formatPayrollReceiptPeriod(2026, 7), "07/26");
    assert.equal(formatPayrollReceiptPeriod(1999, 1), "01/99");
    assert.equal(formatPayrollReceiptPeriod(2000, 12), "12/00");
  });
});

describe("parsePayrollReceiptPeriodMessage", () => {
  it("parses MM/YY", () => {
    assert.deepEqual(parsePayrollReceiptPeriodMessage("07/26"), {
      kind: "success",
      year: 2026,
      month: 7,
    });
  });

  it("parses M/YY and MM/YYYY", () => {
    assert.deepEqual(parsePayrollReceiptPeriodMessage("7/26"), {
      kind: "success",
      year: 2026,
      month: 7,
    });
    assert.deepEqual(parsePayrollReceiptPeriodMessage("07/2026"), {
      kind: "success",
      year: 2026,
      month: 7,
    });
  });

  it("accepts dashes and spaces", () => {
    assert.deepEqual(parsePayrollReceiptPeriodMessage("07-26"), {
      kind: "success",
      year: 2026,
      month: 7,
    });
    assert.deepEqual(parsePayrollReceiptPeriodMessage("07 26"), {
      kind: "success",
      year: 2026,
      month: 7,
    });
  });

  it("resolves two-digit years with pivot", () => {
    assert.equal(parsePayrollReceiptPeriodMessage("01/70").kind, "success");
    if (parsePayrollReceiptPeriodMessage("01/70").kind === "success") {
      assert.equal(parsePayrollReceiptPeriodMessage("01/70").year, 1970);
    }
    assert.equal(parsePayrollReceiptPeriodMessage("01/69").kind, "success");
    if (parsePayrollReceiptPeriodMessage("01/69").kind === "success") {
      assert.equal(parsePayrollReceiptPeriodMessage("01/69").year, 2069);
    }
  });

  it("rejects invalid month", () => {
    assert.equal(parsePayrollReceiptPeriodMessage("13/26").kind, "invalid_month");
    assert.equal(parsePayrollReceiptPeriodMessage("00/26").kind, "invalid_month");
  });

  it("rejects invalid four-digit year", () => {
    assert.equal(parsePayrollReceiptPeriodMessage("07/1969").kind, "invalid_year");
    assert.equal(parsePayrollReceiptPeriodMessage("07/2101").kind, "invalid_year");
  });

  it("rejects phone and CUIL-like values", () => {
    assert.equal(parsePayrollReceiptPeriodMessage("5491122334455").kind, "not_a_period");
    assert.equal(parsePayrollReceiptPeriodMessage("20-12345678-9").kind, "not_a_period");
  });

  it("rejects multiple distinct periods", () => {
    assert.equal(parsePayrollReceiptPeriodMessage("07/26 y 08/26").kind, "ambiguous");
  });

  it("accepts duplicate same period tokens", () => {
    assert.deepEqual(parsePayrollReceiptPeriodMessage("07/26 07/26"), {
      kind: "success",
      year: 2026,
      month: 7,
    });
  });

  it("returns not_a_period for plain text", () => {
    assert.equal(parsePayrollReceiptPeriodMessage("hola").kind, "not_a_period");
    assert.equal(parsePayrollReceiptPeriodMessage("").kind, "not_a_period");
  });
});

describe("buildPayrollReceiptAvailableTemplateVariables", () => {
  it("builds Twilio content variables 1 and 2", () => {
    assert.deepEqual(
      buildPayrollReceiptAvailableTemplateVariables({
        employeeName: " Ana Pérez ",
        year: 2026,
        month: 7,
      }),
      { "1": "Ana Pérez", "2": "07/26" },
    );
  });
});
