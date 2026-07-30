import { Storage, type Bucket, type File } from "@google-cloud/storage";
import { Readable } from "node:stream";
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
  SignedDownloadUrlInput,
  SignedUploadUrlInput,
  StoredObject,
} from "./attachment-storage";

export type GcsAttachmentStorageConfig = {
  projectId: string;
  bucketName: string;
  signedUrlExpirationSeconds: number;
};

const mapGcsError = (error: unknown, fallbackCode: string, fallbackMessage: string): AppError => {
  if (error instanceof AppError) {
    return error;
  }
  const err = error as { code?: number | string; message?: string };
  const code = err.code;
  if (code === 404 || code === "404" || code === 404) {
    return new AppError(404, "GCS_OBJECT_NOT_FOUND", "Objeto no encontrado en storage");
  }
  if (code === 403 || code === "403") {
    return new AppError(503, "GCS_PERMISSION_DENIED", "Sin permisos suficientes en GCS");
  }
  if (code === 412 || code === "412" || /conditionNotMet|precondition/i.test(String(err.message))) {
    return new AppError(409, "GCS_OBJECT_EXISTS", "El objeto ya existe y no puede sobrescribirse");
  }
  return new AppError(
    502,
    fallbackCode,
    `${fallbackMessage}: ${err.message ?? String(error)}`,
  );
};

export class GoogleCloudStorageAttachmentStorage implements AttachmentStorage {
  private readonly storage: Storage;
  private readonly bucket: Bucket;
  readonly bucketName: string;
  private readonly signedUrlExpirationSeconds: number;

  constructor(config: GcsAttachmentStorageConfig, storage?: Storage) {
    this.storage =
      storage ??
      new Storage({
        projectId: config.projectId,
      });
    this.bucketName = config.bucketName;
    this.bucket = this.storage.bucket(config.bucketName);
    this.signedUrlExpirationSeconds = config.signedUrlExpirationSeconds;
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const file = this.bucket.file(input.objectKey);
    const writeStream = file.createWriteStream({
      resumable: false,
      metadata: {
        contentType: input.contentType,
        metadata: input.metadata,
      },
      preconditionOpts:
        input.ifGenerationMatch === 0 ? { ifGenerationMatch: 0 } : undefined,
    });

    try {
      if (Buffer.isBuffer(input.body)) {
        await new Promise<void>((resolve, reject) => {
          writeStream.on("error", reject);
          writeStream.on("finish", () => resolve());
          writeStream.end(input.body);
        });
      } else {
        await pipeline(input.body, writeStream);
      }

      const [metadata] = await file.getMetadata();
      return {
        objectKey: input.objectKey,
        bucketName: this.bucketName,
        generation: String(metadata.generation ?? ""),
        sizeBytes: Number(metadata.size ?? 0),
        contentType: String(metadata.contentType ?? input.contentType),
        checksumSha256: input.metadata?.["checksum-sha256"],
      };
    } catch (error) {
      throw mapGcsError(error, "GCS_UPLOAD_FAILED", "Error al subir objeto a GCS");
    }
  }

  async getObjectStream(input: GetObjectInput): Promise<Readable> {
    try {
      const file = this.resolveFile(input.objectKey, input.generation);
      const [exists] = await file.exists();
      if (!exists) {
        throw new AppError(404, "GCS_OBJECT_NOT_FOUND", "Objeto no encontrado en storage");
      }
      return file.createReadStream();
    } catch (error) {
      throw mapGcsError(error, "GCS_DOWNLOAD_FAILED", "Error al descargar objeto de GCS");
    }
  }

  async getObjectMetadata(input: GetObjectMetadataInput): Promise<ObjectMetadata> {
    try {
      const file = this.resolveFile(input.objectKey, input.generation);
      const [metadata] = await file.getMetadata();
      const custom =
        (metadata.metadata as Record<string, string> | undefined) ?? {};
      return {
        objectKey: input.objectKey,
        bucketName: this.bucketName,
        generation: String(metadata.generation ?? ""),
        sizeBytes: Number(metadata.size ?? 0),
        contentType: String(metadata.contentType ?? "application/octet-stream"),
        metadata: Object.fromEntries(
          Object.entries(custom).map(([k, v]) => [k, String(v)]),
        ),
      };
    } catch (error) {
      throw mapGcsError(error, "GCS_METADATA_FAILED", "Error al leer metadata de GCS");
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    try {
      const file = this.resolveFile(input.objectKey, input.generation);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      throw mapGcsError(error, "GCS_DELETE_FAILED", "Error al eliminar objeto de GCS");
    }
  }

  async objectExists(input: ObjectExistsInput): Promise<boolean> {
    try {
      const file = this.resolveFile(input.objectKey, input.generation);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      throw mapGcsError(error, "GCS_EXISTS_FAILED", "Error al verificar objeto en GCS");
    }
  }

  async createSignedDownloadUrl(input: SignedDownloadUrlInput): Promise<string> {
    try {
      const file = this.resolveFile(input.objectKey, input.generation);
      const expires =
        Date.now() + input.expiresInSeconds * 1000 ||
        Date.now() + this.signedUrlExpirationSeconds * 1000;
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires,
      });
      return url;
    } catch (error) {
      throw mapGcsError(error, "GCS_SIGNED_URL_FAILED", "Error al firmar URL de descarga");
    }
  }

  async createSignedUploadUrl(input: SignedUploadUrlInput): Promise<string> {
    try {
      const file = this.bucket.file(input.objectKey);
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + input.expiresInSeconds * 1000,
        contentType: input.contentType,
      });
      return url;
    } catch (error) {
      throw mapGcsError(error, "GCS_SIGNED_URL_FAILED", "Error al firmar URL de subida");
    }
  }

  async checkAccess(): Promise<{ ok: boolean; message?: string }> {
    try {
      const [exists] = await this.bucket.exists();
      if (!exists) {
        return { ok: false, message: "Bucket no encontrado o inaccesible" };
      }
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message };
    }
  }

  private resolveFile(objectKey: string, generation?: string): File {
    if (generation) {
      return this.bucket.file(objectKey, { generation });
    }
    return this.bucket.file(objectKey);
  }
}
