import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../errors/app-error";
import {
  assertPayrollReceiptPdfFile,
  assertPayrollReceiptPdfMetadata,
  buildPayrollReceiptObjectKey,
  detectPdfFromMagicBytes,
} from "./file-validation";

describe("payroll receipt file-validation", () => {
  it("builds object keys with prefix and period segments", () => {
    const key = buildPayrollReceiptObjectKey({
      storagePrefix: "payroll-receipts",
      companyId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      year: 2024,
      month: 3,
      receiptId: "11111111-2222-3333-4444-555555555555",
    });
    assert.equal(
      key,
      "payroll-receipts/companies/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/payroll-receipts/2024/3/11111111-2222-3333-4444-555555555555/original",
    );
  });

  it("rejects path traversal in key parts", () => {
    assert.throws(
      () =>
        buildPayrollReceiptObjectKey({
          storagePrefix: "payroll-receipts",
          companyId: "../evil",
          year: 2024,
          month: 1,
          receiptId: "id",
        }),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_OBJECT_KEY_PART",
    );
  });

  it("detects PDF magic bytes and rejects non-PDF", () => {
    assert.equal(detectPdfFromMagicBytes(Buffer.from("%PDF-1.4xxxx")), true);
    assert.equal(detectPdfFromMagicBytes(Buffer.from("not-a-pdf")), false);

    const ok = assertPayrollReceiptPdfFile({
      originalFileName: "recibo.pdf",
      declaredContentType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF"),
      maxFileSizeBytes: 1024,
    });
    assert.equal(ok.mimeType, "application/pdf");

    assert.throws(
      () =>
        assertPayrollReceiptPdfFile({
          originalFileName: "recibo.png",
          declaredContentType: "image/png",
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          maxFileSizeBytes: 1024,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "PAYROLL_RECEIPT_EXTENSION_MISMATCH",
    );
  });

  it("assertPayrollReceiptPdfMetadata checks extension and declared MIME", () => {
    const ok = assertPayrollReceiptPdfMetadata({
      originalFileName: "recibo.pdf",
      declaredContentType: "application/pdf",
    });
    assert.equal(ok.originalFileName, "recibo.pdf");

    assert.throws(
      () =>
        assertPayrollReceiptPdfMetadata({
          originalFileName: "recibo.exe",
          declaredContentType: "application/pdf",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "PAYROLL_RECEIPT_EXTENSION_FORBIDDEN",
    );

    assert.throws(
      () =>
        assertPayrollReceiptPdfMetadata({
          originalFileName: "recibo.pdf",
          declaredContentType: "image/png",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "PAYROLL_RECEIPT_MIME_MISMATCH",
    );
  });
});
