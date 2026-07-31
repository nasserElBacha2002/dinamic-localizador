import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../errors/app-error";
import type {
  AttachmentStorage,
  DeleteObjectInput,
  GetObjectInput,
  GetObjectMetadataInput,
  ObjectExistsInput,
  ObjectMetadata,
  PutObjectInput,
  StoredObject,
} from "./attachment-storage";

type StoredEntry = {
  buffer: Buffer;
  contentType: string;
  generation: string;
  metadata: Record<string, string>;
};

const readBody = async (input: PutObjectInput): Promise<Buffer> => {
  if (Buffer.isBuffer(input.body)) {
    return input.body;
  }
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (chunk: Buffer) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  const transforms = input.transforms ?? [];
  if (transforms.length === 0) {
    await pipeline(input.body, sink);
  } else if (transforms.length === 1) {
    await pipeline(input.body, transforms[0]!, sink);
  } else {
    await pipeline(input.body, transforms[0]!, ...transforms.slice(1), sink);
  }
  return Buffer.concat(chunks);
};

/** Contract-test only — never use as productive fallback. */
export class InMemoryAttachmentStorage implements AttachmentStorage {
  readonly bucketName: string;
  private readonly objects = new Map<string, StoredEntry>();
  private generationCounter = 1;

  constructor(bucketName = "test-bucket") {
    this.bucketName = bucketName;
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    if (input.ifGenerationMatch === 0 && this.objects.has(input.objectKey)) {
      throw new AppError(
        409,
        "GCS_OBJECT_EXISTS",
        "El objeto ya existe y no puede sobrescribirse",
      );
    }
    const buffer = await readBody(input);
    const generation = String(this.generationCounter++);
    this.objects.set(input.objectKey, {
      buffer,
      contentType: input.contentType,
      generation,
      metadata: { ...(input.metadata ?? {}) },
    });
    return {
      objectKey: input.objectKey,
      bucketName: this.bucketName,
      generation,
      sizeBytes: buffer.length,
      contentType: input.contentType,
      checksumSha256: input.metadata?.["checksum-sha256"],
    };
  }

  async getObjectStream(input: GetObjectInput): Promise<Readable> {
    const entry = this.require(input.objectKey, input.generation);
    return Readable.from(entry.buffer);
  }

  async getObjectMetadata(input: GetObjectMetadataInput): Promise<ObjectMetadata> {
    const entry = this.require(input.objectKey, input.generation);
    return {
      objectKey: input.objectKey,
      bucketName: this.bucketName,
      generation: entry.generation,
      sizeBytes: entry.buffer.length,
      contentType: entry.contentType,
      metadata: { ...entry.metadata },
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const entry = this.objects.get(input.objectKey);
    if (!entry) {
      return;
    }
    if (input.generation && entry.generation !== input.generation) {
      throw new AppError(
        409,
        "GCS_GENERATION_MISMATCH",
        "La generation del objeto no coincide",
      );
    }
    this.objects.delete(input.objectKey);
  }

  async objectExists(input: ObjectExistsInput): Promise<boolean> {
    const entry = this.objects.get(input.objectKey);
    if (!entry) {
      return false;
    }
    if (input.generation && entry.generation !== input.generation) {
      return false;
    }
    return true;
  }

  async checkAccess(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true };
  }

  clear(): void {
    this.objects.clear();
  }

  private require(objectKey: string, generation?: string): StoredEntry {
    const entry = this.objects.get(objectKey);
    if (!entry) {
      throw new AppError(404, "GCS_OBJECT_NOT_FOUND", "Objeto no encontrado en storage");
    }
    if (generation && entry.generation !== generation) {
      throw new AppError(
        409,
        "GCS_GENERATION_MISMATCH",
        "La generation del objeto no coincide",
      );
    }
    return entry;
  }
}
