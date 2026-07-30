import { env } from "../../config/env";
import type { AttachmentStorage } from "./attachment-storage";
import { GoogleCloudStorageAttachmentStorage } from "./gcs-attachment-storage";

export type { AttachmentStorage } from "./attachment-storage";
export { GoogleCloudStorageAttachmentStorage } from "./gcs-attachment-storage";
export { InMemoryAttachmentStorage } from "./in-memory-attachment-storage";

let cachedStorage: AttachmentStorage | null = null;
let cachedUnavailableReason: string | null = null;

export const isGcsConfigured = (): boolean =>
  Boolean(env.GCS_PROJECT_ID?.trim() && env.GCS_BUCKET_NAME?.trim());

export const getGcsUnavailableReason = (): string | null => {
  if (!env.GCS_PROJECT_ID?.trim()) {
    return "GCS_PROJECT_ID no configurado";
  }
  if (!env.GCS_BUCKET_NAME?.trim()) {
    return "GCS_BUCKET_NAME no configurado";
  }
  return null;
};

/**
 * Returns productive GCS storage when configured.
 * Never falls back to filesystem or in-memory for production paths.
 */
export const getAttachmentStorage = (): AttachmentStorage => {
  const reason = getGcsUnavailableReason();
  if (reason) {
    cachedUnavailableReason = reason;
    throw new Error(`Attachment storage unavailable: ${reason}`);
  }

  if (!cachedStorage) {
    cachedStorage = new GoogleCloudStorageAttachmentStorage({
      projectId: env.GCS_PROJECT_ID!,
      bucketName: env.GCS_BUCKET_NAME!,
      signedUrlExpirationSeconds: env.GCS_SIGNED_URL_EXPIRATION_SECONDS,
    });
    cachedUnavailableReason = null;
  }
  return cachedStorage;
};

/** Test/DI override — must not be used as silent production fallback. */
export const setAttachmentStorageForTests = (storage: AttachmentStorage | null): void => {
  cachedStorage = storage;
  cachedUnavailableReason = null;
};

export const getCachedUnavailableReason = (): string | null => cachedUnavailableReason;
