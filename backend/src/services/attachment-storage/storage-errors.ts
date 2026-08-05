import { AppError } from "../../errors/app-error";

/** Typed storage miss — treat as idempotent success for deletes. */
export class StorageObjectNotFoundError extends Error {
  readonly code = "STORAGE_OBJECT_NOT_FOUND" as const;

  constructor(objectKey: string) {
    super(`Storage object not found: ${objectKey}`);
    this.name = "StorageObjectNotFoundError";
  }
}

export const isStorageObjectNotFoundError = (error: unknown): boolean => {
  if (error instanceof StorageObjectNotFoundError) {
    return true;
  }
  if (error instanceof AppError) {
    return (
      error.code === "STORAGE_OBJECT_NOT_FOUND" || error.code === "GCS_OBJECT_NOT_FOUND"
    );
  }
  return false;
};
