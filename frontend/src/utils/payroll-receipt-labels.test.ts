import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCuilDisplay,
  PAYROLL_MONTH_LABELS,
  payrollReceiptStatusLabels,
  payrollUploadCompletionMessage,
  previewCuilFromFilename,
  summarizePayrollUploadOutcomes,
} from "./payroll-receipt-labels";

describe("formatCuilDisplay", () => {
  it("formats an 11-digit normalized CUIL as XX-XXXXXXXX-X", () => {
    assert.equal(formatCuilDisplay("20123456789"), "20-12345678-9");
  });

  it("returns em dash for empty values", () => {
    assert.equal(formatCuilDisplay(null), "—");
    assert.equal(formatCuilDisplay(undefined), "—");
    assert.equal(formatCuilDisplay(""), "—");
  });

  it("returns the original string when not 11 digits", () => {
    assert.equal(formatCuilDisplay("123"), "123");
  });
});

describe("payroll receipt labels", () => {
  it("exposes Spanish month names", () => {
    assert.equal(PAYROLL_MONTH_LABELS[1], "Enero");
    assert.equal(PAYROLL_MONTH_LABELS[12], "Diciembre");
  });

  it("exposes Spanish receipt status labels", () => {
    assert.equal(payrollReceiptStatusLabels.ASSOCIATED, "Asociado");
    assert.equal(payrollReceiptStatusLabels.DOCUMENT_NOT_FOUND, "CUIL no encontrado");
  });
});

describe("previewCuilFromFilename", () => {
  it("extracts 11 consecutive digits from a filename", () => {
    assert.equal(previewCuilFromFilename("recibo_20123456789.pdf"), "20123456789");
  });

  it("extracts formatted CUIL patterns", () => {
    assert.equal(previewCuilFromFilename("20-12345678-9_enero.pdf"), "20123456789");
  });

  it("returns null when no CUIL-shaped digits exist", () => {
    assert.equal(previewCuilFromFilename("sin-documento.pdf"), null);
  });
});

describe("summarizePayrollUploadOutcomes", () => {
  it("treats domain rejection statuses as failed, not success", () => {
    const summary = summarizePayrollUploadOutcomes([
      "ASSOCIATED",
      "DOCUMENT_NOT_FOUND",
      "DUPLICATE",
      "ERROR",
    ]);
    assert.equal(summary.associated, 1);
    assert.equal(summary.failed, 1);
    assert.equal(summary.duplicates, 1);
    assert.equal(summary.networkErrors, 1);
  });

  it("does not report green success when all files were rejected", () => {
    const summary = summarizePayrollUploadOutcomes([
      "EMPLOYEE_NOT_FOUND",
      "INVALID_DOCUMENT",
    ]);
    const alert = payrollUploadCompletionMessage(summary);
    assert.equal(alert.color, "red");
    assert.match(alert.message, /Ningún recibo fue asociado/);
  });

  it("reports yellow when mixed outcomes", () => {
    const summary = summarizePayrollUploadOutcomes(["ASSOCIATED", "DUPLICATE"]);
    const alert = payrollUploadCompletionMessage(summary);
    assert.equal(alert.color, "yellow");
    assert.match(alert.message, /archivo/i);
  });
});
