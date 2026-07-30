/**
 * Enable absence attachments for one company after GCS readiness check.
 *
 * Usage:
 *   npx tsx --import ./src/test-helpers/preload-test-env.ts \
 *     src/scripts/enable-absence-attachments.ts --company=<uuid>
 *
 * Requires GCS_PROJECT_ID + GCS_BUCKET_NAME and accessible bucket.
 */
import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { auditService } from "../services/audit.service";
import { absenceAttachmentService } from "../services/absence-attachment.service";
import { isGcsConfigured } from "../services/attachment-storage";

const parseCompanyId = (): string => {
  const arg = process.argv.find((item) => item.startsWith("--company="));
  const value = arg?.slice("--company=".length)?.trim();
  if (!value) {
    throw new Error("Missing --company=<uuid>");
  }
  return value;
};

const main = async (): Promise<void> => {
  const companyId = parseCompanyId();

  if (!isGcsConfigured()) {
    throw new Error("Cannot enable attachments: GCS_PROJECT_ID / GCS_BUCKET_NAME missing");
  }

  const health = await absenceAttachmentService.getStorageHealth();
  if (!health.available) {
    throw new Error(`Cannot enable attachments: GCS not available (${health.message ?? "unknown"})`);
  }

  await connectDatabase();
  const pool = getPool();

  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    UPDATE company_settings
    SET absence_attachments_enabled = 1,
        updated_at = SYSUTCDATETIME()
    WHERE company_id = @companyId
  `);

  await auditService.log(companyId, {
    entityType: "company_settings",
    entityId: companyId,
    action: "ENABLE_ABSENCE_ATTACHMENTS",
    newData: { absenceAttachmentsEnabled: true },
  });

  console.info(`absence_attachments_enabled=1 for company ${companyId}`);
  await closeDatabase();
};

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
