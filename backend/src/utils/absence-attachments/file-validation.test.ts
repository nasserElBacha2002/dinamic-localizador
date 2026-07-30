import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertAllowedAttachmentFile,
  buildAbsenceAttachmentObjectKey,
  detectMimeFromMagicBytes,
  sanitizeOriginalFileName,
  sha256Hex,
} from "./file-validation";

describe("absence attachment file validation", () => {
  it("builds opaque company-scoped object keys", () => {
    const key = buildAbsenceAttachmentObjectKey({
      storagePrefix: "absence-attachments",
      companyId: "11111111-1111-1111-1111-111111111111",
      absenceRequestId: "22222222-2222-2222-2222-222222222222",
      attachmentId: "33333333-3333-3333-3333-333333333333",
    });
    assert.equal(
      key,
      "absence-attachments/companies/11111111-1111-1111-1111-111111111111/absence-requests/22222222-2222-2222-2222-222222222222/attachments/33333333-3333-3333-3333-333333333333/original",
    );
    assert.ok(!key.includes(".."));
  });

  it("rejects path traversal in key parts", () => {
    assert.throws(() =>
      buildAbsenceAttachmentObjectKey({
        storagePrefix: "absence-attachments",
        companyId: "../evil",
        absenceRequestId: "22222222-2222-2222-2222-222222222222",
        attachmentId: "33333333-3333-3333-3333-333333333333",
      }),
    );
  });

  it("sanitizes original file names", () => {
    assert.equal(sanitizeOriginalFileName("../../etc/passwd.pdf"), "passwd.pdf");
    assert.equal(sanitizeOriginalFileName("informe (1).PDF"), "informe (1).PDF");
  });

  it("detects PDF/JPEG/PNG/WEBP magic bytes", () => {
    const pdf = Buffer.from("%PDF-1.4\n%âãÏÓ\n");
    assert.equal(detectMimeFromMagicBytes(pdf), "application/pdf");

    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(detectMimeFromMagicBytes(jpeg), "image/jpeg");

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    assert.equal(detectMimeFromMagicBytes(png), "image/png");

    const webp = Buffer.from("RIFF....WEBP", "ascii");
    assert.equal(detectMimeFromMagicBytes(webp), "image/webp");
  });

  it("rejects fake PDF by extension only", () => {
    const fake = Buffer.from("not a pdf file!!!!");
    assert.throws(
      () =>
        assertAllowedAttachmentFile({
          originalFileName: "doc.pdf",
          declaredContentType: "application/pdf",
          buffer: fake,
          maxFileSizeBytes: 1_000_000,
        }),
      /tipo real|UNRECOGNIZED|reconocer/i,
    );
  });

  it("accepts real PDF and computes sha256", () => {
    const pdf = Buffer.from("%PDF-1.4\nhello\n%%EOF\n");
    const result = assertAllowedAttachmentFile({
      originalFileName: "certificado.pdf",
      declaredContentType: "application/pdf",
      buffer: pdf,
      maxFileSizeBytes: 1_000_000,
    });
    assert.equal(result.detectedContentType, "application/pdf");
    assert.equal(result.checksumSha256, sha256Hex(pdf));
  });

  it("rejects empty files", () => {
    assert.throws(() =>
      assertAllowedAttachmentFile({
        originalFileName: "a.pdf",
        declaredContentType: "application/pdf",
        buffer: Buffer.alloc(0),
        maxFileSizeBytes: 1000,
      }),
    );
  });
});
