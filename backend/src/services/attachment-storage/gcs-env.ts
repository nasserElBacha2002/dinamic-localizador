import { env } from "../../config/env";

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
