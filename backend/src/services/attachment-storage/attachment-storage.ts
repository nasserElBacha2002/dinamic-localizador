import type { Readable } from "node:stream";

export type PutObjectInput = {
  objectKey: string;
  body: Readable | Buffer;
  contentType: string;
  sizeBytes?: number;
  metadata?: Record<string, string>;
  /** Precondition: only create if generation is 0 (object must not exist). */
  ifGenerationMatch?: number;
};

export type StoredObject = {
  objectKey: string;
  bucketName: string;
  generation: string;
  sizeBytes: number;
  contentType: string;
  checksumSha256?: string;
};

export type GetObjectInput = {
  objectKey: string;
  generation?: string;
};

export type GetObjectMetadataInput = {
  objectKey: string;
  generation?: string;
};

export type ObjectMetadata = {
  objectKey: string;
  bucketName: string;
  generation: string;
  sizeBytes: number;
  contentType: string;
  metadata: Record<string, string>;
};

export type DeleteObjectInput = {
  objectKey: string;
  generation?: string;
};

export type ObjectExistsInput = {
  objectKey: string;
  generation?: string;
};

export type SignedDownloadUrlInput = {
  objectKey: string;
  expiresInSeconds: number;
  generation?: string;
};

export type SignedUploadUrlInput = {
  objectKey: string;
  expiresInSeconds: number;
  contentType: string;
};

/**
 * Productive attachment object storage (GCS).
 * In-memory implementation exists only for contractual unit tests.
 */
export interface AttachmentStorage {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObjectStream(input: GetObjectInput): Promise<Readable>;
  getObjectMetadata(input: GetObjectMetadataInput): Promise<ObjectMetadata>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  objectExists(input: ObjectExistsInput): Promise<boolean>;
  createSignedDownloadUrl?(input: SignedDownloadUrlInput): Promise<string>;
  createSignedUploadUrl?(input: SignedUploadUrlInput): Promise<string>;
  /** Lightweight readiness probe — must not upload real files. */
  checkAccess?(): Promise<{ ok: boolean; message?: string }>;
}
