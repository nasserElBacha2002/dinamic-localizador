import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { AppError } from "../../errors/app-error";
import { GoogleCloudStorageAttachmentStorage } from "./gcs-attachment-storage";

type MockFile = {
  createWriteStream: (opts: unknown) => {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: (body?: Buffer) => void;
  };
  getMetadata: () => Promise<[{ generation: string; size: string; contentType: string; metadata?: Record<string, string> }]>;
  exists: () => Promise<[boolean]>;
  createReadStream: () => Readable;
  delete: (opts?: { ignoreNotFound?: boolean }) => Promise<void>;
  getSignedUrl: (opts: {
    version: string;
    action: string;
    expires: number;
    contentType?: string;
  }) => Promise<[string]>;
};

/**
 * Contract smoke for GCS SDK wiring (mocked). Does not hit a real bucket.
 * Covers signed URL options, generation-as-string, and error mapping used by
 * payroll receipts / absence attachments.
 *
 * Real package compatibility (uuid override / gaxios / teeny-request) lives in
 * google-sdk-compatibility.test.ts — do not treat this mock suite as SDK proof.
 */
describe("GoogleCloudStorageAttachmentStorage SDK contract (mocked)", () => {
  const makeStorage = (file: MockFile) => {
    const bucket = {
      file: (objectKey: string, opts?: { generation?: string }) => {
        assert.equal(typeof objectKey, "string");
        if (opts?.generation) {
          assert.equal(typeof opts.generation, "string");
        }
        return file;
      },
      exists: async (): Promise<[boolean]> => [true],
    };
    const storage = {
      bucket: (name: string) => {
        assert.equal(name, "dinamic-attachments");
        return bucket;
      },
    };
    // Intentional test double: Storage SDK surface is large; `as never` avoids a
    // hand-rolled partial type solely for the wrapper contract suite.
    return new GoogleCloudStorageAttachmentStorage(
      {
        projectId: "test-project",
        bucketName: "dinamic-attachments",
        signedUrlExpirationSeconds: 900,
      },
      storage as never,
    );
  };

  it("uploads buffer and returns generation as string", async () => {
    let writeOpts: { resumable?: boolean; preconditionOpts?: { ifGenerationMatch?: number } } | undefined;
    const file: MockFile = {
      createWriteStream: (opts) => {
        writeOpts = opts as typeof writeOpts;
        const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
        return {
          on(event, cb) {
            handlers[event] = handlers[event] ?? [];
            handlers[event]!.push(cb);
          },
          end() {
            for (const cb of handlers.finish ?? []) {
              cb();
            }
          },
        };
      },
      getMetadata: async () => [
        {
          generation: "1734567890123456",
          size: "12",
          contentType: "application/pdf",
          metadata: { "checksum-sha256": "abc" },
        },
      ],
      exists: async () => [true],
      createReadStream: () => Readable.from([Buffer.from("x")]),
      delete: async () => undefined,
      getSignedUrl: async () => ["https://example.invalid/signed"],
    };

    const storage = makeStorage(file);
    const stored = await storage.putObject({
      objectKey: "payroll-receipts/companies/c/receipts/r.pdf",
      body: Buffer.from("%PDF-1.4\n"),
      contentType: "application/pdf",
      ifGenerationMatch: 0,
      metadata: { "checksum-sha256": "abc" },
    });

    assert.equal(writeOpts?.resumable, false);
    assert.equal(writeOpts?.preconditionOpts?.ifGenerationMatch, 0);
    assert.equal(stored.generation, "1734567890123456");
    assert.equal(typeof stored.generation, "string");
    assert.equal(stored.sizeBytes, 12);
    assert.equal(stored.bucketName, "dinamic-attachments");
  });

  it("creates signed download URL with v4 read and caller TTL", async () => {
    const expiresInSeconds = 600;
    const before = Date.now();
    let captured: { version: string; action: string; expires: number } | undefined;
    const file: MockFile = {
      createWriteStream: () => {
        throw new Error("unused");
      },
      getMetadata: async () => [{ generation: "1", size: "1", contentType: "application/pdf" }],
      exists: async () => [true],
      createReadStream: () => Readable.from([]),
      delete: async () => undefined,
      getSignedUrl: async (opts) => {
        captured = opts;
        return [
          `https://storage.googleapis.com/dinamic-attachments/payroll-receipts%2Fr.pdf?expires=${opts.expires}`,
        ];
      },
    };

    const storage = makeStorage(file);
    const url = await storage.createSignedDownloadUrl({
      objectKey: "payroll-receipts/r.pdf",
      expiresInSeconds,
      generation: "1734567890123456",
    });

    assert.match(url, /^https:\/\/storage\.googleapis\.com\//);
    assert.equal(captured?.version, "v4");
    assert.equal(captured?.action, "read");
    assert.ok(captured && captured.expires >= before + expiresInSeconds * 1000 - 50);
    assert.ok(captured && captured.expires <= Date.now() + expiresInSeconds * 1000 + 50);
  });

  it("creates signed upload URL with contentType", async () => {
    let captured: { version: string; action: string; contentType?: string } | undefined;
    const file: MockFile = {
      createWriteStream: () => {
        throw new Error("unused");
      },
      getMetadata: async () => [{ generation: "1", size: "1", contentType: "application/pdf" }],
      exists: async () => [true],
      createReadStream: () => Readable.from([]),
      delete: async () => undefined,
      getSignedUrl: async (opts) => {
        captured = opts;
        return ["https://storage.googleapis.com/upload-signed"];
      },
    };

    const storage = makeStorage(file);
    const url = await storage.createSignedUploadUrl({
      objectKey: "absence-attachments/a/original",
      expiresInSeconds: 300,
      contentType: "application/pdf",
    });

    assert.equal(url, "https://storage.googleapis.com/upload-signed");
    assert.equal(captured?.version, "v4");
    assert.equal(captured?.action, "write");
    assert.equal(captured?.contentType, "application/pdf");
  });

  it("maps 404 and 403 GCS errors to AppError codes", async () => {
    const notFoundFile: MockFile = {
      createWriteStream: () => {
        throw new Error("unused");
      },
      getMetadata: async () => {
        throw Object.assign(new Error("Not Found"), { code: 404 });
      },
      exists: async () => [false],
      createReadStream: () => Readable.from([]),
      delete: async () => undefined,
      getSignedUrl: async () => {
        throw Object.assign(new Error("Forbidden"), { code: 403 });
      },
    };

    const storage = makeStorage(notFoundFile);
    await assert.rejects(
      () => storage.getObjectMetadata({ objectKey: "missing" }),
      (error: unknown) => error instanceof AppError && error.code === "GCS_OBJECT_NOT_FOUND",
    );
    await assert.rejects(
      () =>
        storage.createSignedDownloadUrl({
          objectKey: "missing",
          expiresInSeconds: 60,
        }),
      (error: unknown) => error instanceof AppError && error.code === "GCS_PERMISSION_DENIED",
    );
  });

  it("deletes with ignoreNotFound and checks access", async () => {
    let deleted = false;
    const file: MockFile = {
      createWriteStream: () => {
        throw new Error("unused");
      },
      getMetadata: async () => [{ generation: "1", size: "1", contentType: "application/pdf" }],
      exists: async () => [true],
      createReadStream: () => Readable.from([]),
      delete: async (opts) => {
        assert.equal(opts?.ignoreNotFound, true);
        deleted = true;
      },
      getSignedUrl: async () => ["https://example.invalid"],
    };

    const storage = makeStorage(file);
    await storage.deleteObject({ objectKey: "k", generation: "99" });
    assert.equal(deleted, true);
    const access = await storage.checkAccess();
    assert.equal(access.ok, true);
  });
});
