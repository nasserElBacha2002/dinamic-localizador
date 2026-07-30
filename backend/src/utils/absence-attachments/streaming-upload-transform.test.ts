import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, it } from "node:test";
import { AttachmentUploadTransform } from "./streaming-upload-transform";
import { buildContentDisposition } from "./content-disposition";

describe("AttachmentUploadTransform", () => {
  it("streams PDF magic bytes, checksum and size without buffering full file API", async () => {
    const pdfHead = Buffer.from("%PDF-1.4 mock content for test hashing");
    const transform = new AttachmentUploadTransform(1024 * 1024);
    const chunks: Buffer[] = [];
    transform.on("data", (c: Buffer) => chunks.push(c));
    await pipeline(Readable.from([pdfHead]), transform);
    assert.equal(transform.detectedContentType, "application/pdf");
    assert.equal(transform.sizeBytes, pdfHead.length);
    assert.match(transform.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(Buffer.concat(chunks).length, pdfHead.length);
  });

  it("rejects oversized streams", async () => {
    const transform = new AttachmentUploadTransform(8);
    await assert.rejects(
      () => pipeline(Readable.from([Buffer.alloc(16, 1)]), transform),
      (err: { code?: string }) => err.code === "ATTACHMENT_TOO_LARGE",
    );
  });
});

describe("buildContentDisposition", () => {
  it("emits RFC5987 filename* for unicode names", () => {
    const header = buildContentDisposition("attachment", "informe médico.pdf");
    assert.match(header, /^attachment;/);
    assert.match(header, /filename\*=UTF-8''/);
    assert.match(header, /m/);
  });
});
