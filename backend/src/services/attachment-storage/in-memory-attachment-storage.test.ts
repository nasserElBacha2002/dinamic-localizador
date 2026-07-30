import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryAttachmentStorage } from "./in-memory-attachment-storage";
import { AppError } from "../../errors/app-error";

describe("InMemoryAttachmentStorage contract", () => {
  it("puts, reads metadata, streams, and deletes", async () => {
    const storage = new InMemoryAttachmentStorage("test-bucket");
    const body = Buffer.from("%PDF-1.4\ntest\n");
    const stored = await storage.putObject({
      objectKey: "absence-attachments/companies/c/absence-requests/r/attachments/a/original",
      body,
      contentType: "application/pdf",
      ifGenerationMatch: 0,
      metadata: { "checksum-sha256": "abc" },
    });
    assert.ok(stored.generation);
    assert.equal(stored.sizeBytes, body.length);

    const meta = await storage.getObjectMetadata({ objectKey: stored.objectKey });
    assert.equal(meta.sizeBytes, body.length);
    assert.equal(meta.metadata["checksum-sha256"], "abc");

    const stream = await storage.getObjectStream({ objectKey: stored.objectKey });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    assert.deepEqual(Buffer.concat(chunks), body);

    await storage.deleteObject({ objectKey: stored.objectKey, generation: stored.generation });
    assert.equal(await storage.objectExists({ objectKey: stored.objectKey }), false);
  });

  it("refuses overwrite when ifGenerationMatch=0", async () => {
    const storage = new InMemoryAttachmentStorage();
    const key = "k/original";
    await storage.putObject({
      objectKey: key,
      body: Buffer.from("a"),
      contentType: "application/pdf",
      ifGenerationMatch: 0,
    });
    await assert.rejects(
      () =>
        storage.putObject({
          objectKey: key,
          body: Buffer.from("b"),
          contentType: "application/pdf",
          ifGenerationMatch: 0,
        }),
      (error: unknown) => error instanceof AppError && error.code === "GCS_OBJECT_EXISTS",
    );
  });

  it("reports missing objects", async () => {
    const storage = new InMemoryAttachmentStorage();
    await assert.rejects(
      () => storage.getObjectMetadata({ objectKey: "missing" }),
      (error: unknown) => error instanceof AppError && error.code === "GCS_OBJECT_NOT_FOUND",
    );
  });
});
