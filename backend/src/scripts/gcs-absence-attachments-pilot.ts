/**
 * Operational GCS pilot for absence attachments.
 * Uses ADC / GOOGLE_APPLICATION_CREDENTIALS. Never logs secrets or signed URLs.
 *
 * Usage:
 *   npx tsx --import ./src/test-helpers/preload-test-env.ts \
 *     src/scripts/gcs-absence-attachments-pilot.ts
 */
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { resolveGoogleApplicationCredentialsPath } from "../config/resolve-gcp-credentials";
import {
  GoogleCloudStorageAttachmentStorage,
  isGcsConfigured,
} from "../services/attachment-storage";

resolveGoogleApplicationCredentialsPath();

type Check = { name: string; ok: boolean; detail?: string };

const main = async (): Promise<void> => {
  const checks: Check[] = [];
  const report = (name: string, ok: boolean, detail?: string) => {
    checks.push({ name, ok, detail });
    console.info(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  if (!isGcsConfigured()) {
    report("gcs_configured", false, "GCS_PROJECT_ID / GCS_BUCKET_NAME missing");
    process.exitCode = 1;
    return;
  }
  report("gcs_configured", true, `project=${env.GCS_PROJECT_ID} bucket=${env.GCS_BUCKET_NAME}`);
  report(
    "credentials_source",
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCLOUD_PROJECT),
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? "GOOGLE_APPLICATION_CREDENTIALS set"
      : "ADC / workload identity expected",
  );

  const storage = new GoogleCloudStorageAttachmentStorage({
    projectId: env.GCS_PROJECT_ID!,
    bucketName: env.GCS_BUCKET_NAME!,
    signedUrlExpirationSeconds: env.GCS_SIGNED_URL_EXPIRATION_SECONDS,
  });

  const access = await storage.checkAccess();
  report("bucket_accessible", access.ok, access.message);

  // IAM/PAP/UBA: best-effort via @google-cloud/storage metadata when available
  try {
    const { Storage } = await import("@google-cloud/storage");
    const gcs = new Storage({ projectId: env.GCS_PROJECT_ID });
    const [meta] = await gcs.bucket(env.GCS_BUCKET_NAME!).getMetadata();
    const iamConfig = meta.iamConfiguration as
      | { publicAccessPrevention?: string; uniformBucketLevelAccess?: { enabled?: boolean } }
      | undefined;
    report(
      "public_access_prevention",
      iamConfig?.publicAccessPrevention === "enforced",
      String(iamConfig?.publicAccessPrevention ?? "unknown"),
    );
    report(
      "uniform_bucket_level_access",
      Boolean(iamConfig?.uniformBucketLevelAccess?.enabled),
      String(iamConfig?.uniformBucketLevelAccess?.enabled ?? "unknown"),
    );
  } catch (error) {
    report(
      "bucket_policy_metadata",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  const objectKey = `${env.GCS_STORAGE_PREFIX}/_pilot/${randomUUID()}/original`;
  const body = Buffer.from("%PDF-1.4\npilot\n%%EOF\n");
  let generation = "";

  try {
    const put = await storage.putObject({
      objectKey,
      body,
      contentType: "application/pdf",
      ifGenerationMatch: 0,
      metadata: { "checksum-sha256": "pilot", "upload-source": "PILOT" },
    });
    generation = put.generation;
    report("upload", true, `generation=${generation}`);

    await storage
      .putObject({
        objectKey,
        body: Buffer.from("overwrite"),
        contentType: "application/pdf",
        ifGenerationMatch: 0,
      })
      .then(() => report("overwrite_rejected", false, "overwrite unexpectedly succeeded"))
      .catch(() => report("overwrite_rejected", true));

    const meta = await storage.getObjectMetadata({ objectKey, generation });
    report("metadata", meta.sizeBytes === body.length, `size=${meta.sizeBytes}`);

    const stream = await storage.getObjectStream({ objectKey, generation });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    report("download", Buffer.concat(chunks).equals(body));

    await storage.deleteObject({ objectKey, generation });
    const exists = await storage.objectExists({ objectKey });
    report("delete", !exists);

    await storage
      .getObjectMetadata({ objectKey })
      .then(() => report("missing_object", false))
      .catch(() => report("missing_object", true));
  } catch (error) {
    report("pilot_pipeline", false, error instanceof Error ? error.message : String(error));
    try {
      await storage.deleteObject({ objectKey, generation: generation || undefined });
      report("cleanup_after_failure", true);
    } catch (cleanupError) {
      report(
        "cleanup_after_failure",
        false,
        cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      );
    }
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
};

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
