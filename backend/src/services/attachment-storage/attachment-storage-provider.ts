import { env } from "../../config/env";
import type { AttachmentStorage } from "./attachment-storage";
import { GoogleCloudStorageAttachmentStorage } from "./gcs-attachment-storage";
import { getGcsUnavailableReason } from "./gcs-env";

let cachedStorage: AttachmentStorage | null = null;
let cachedUnavailableReason: string | null = null;

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
