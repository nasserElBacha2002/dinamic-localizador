import sql from "mssql";
import { getPool } from "../database/connection";

/**
 * Durable enqueue of GCS object keys into `company_pending_storage_deletions`.
 * Idempotent via WHERE NOT EXISTS (mirrors company-deletion-purge enqueue).
 *
 * Callers must enqueue inside the same SQL transaction that drops DB references
 * (soft-delete / replace / cascade). Do NOT delete GCS objects inside SQL txns.
 *
 * Drained by company deletion purge (`deletePendingStorageObjects`). There is no
 * standalone payroll-only worker yet; enqueue still ensures company purge / a
 * future worker can reclaim objects after DB refs are gone.
 */

const tableExists = async (
  tableName: "absence_request_attachments" | "payroll_receipts",
): Promise<boolean> => {
  const qualified =
    tableName === "absence_request_attachments"
      ? "N'dbo.absence_request_attachments'"
      : "N'dbo.payroll_receipts'";
  const result = await getPool().request().query(`
    SELECT CASE WHEN OBJECT_ID(${qualified}, N'U') IS NULL THEN 0 ELSE 1 END AS present
  `);
  return Number(result.recordset[0]?.present) === 1;
};

export const pendingStorageDeletionRepository = {
  async enqueueKeys(
    companyId: string,
    objectKeys: string[],
    transaction?: sql.Transaction,
  ): Promise<number> {
    const uniqueKeys = [
      ...new Set(objectKeys.map((k) => k.trim()).filter((k) => k.length > 0)),
    ];
    if (uniqueKeys.length === 0) {
      return 0;
    }

    let inserted = 0;
    for (const storageObjectKey of uniqueKeys) {
      const request = transaction
        ? new sql.Request(transaction)
        : getPool().request();
      const result = await request
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("storageObjectKey", sql.NVarChar(500), storageObjectKey)
        .query(`
          INSERT INTO company_pending_storage_deletions (company_id, storage_object_key)
          SELECT @companyId, @storageObjectKey
          WHERE NOT EXISTS (
            SELECT 1
            FROM company_pending_storage_deletions p
            WHERE p.company_id = @companyId
              AND p.storage_object_key = @storageObjectKey
          )
        `);
      inserted += Number(result.rowsAffected[0] ?? 0);
    }
    return inserted;
  },

  async enqueueFromAbsenceAttachments(companyId: string): Promise<void> {
    if (!(await tableExists("absence_request_attachments"))) {
      return;
    }
    await getPool().request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      INSERT INTO company_pending_storage_deletions (company_id, storage_object_key)
      SELECT DISTINCT a.company_id, a.object_key
      FROM absence_request_attachments a
      WHERE a.company_id = @companyId
        AND a.object_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM company_pending_storage_deletions p
          WHERE p.company_id = a.company_id AND p.storage_object_key = a.object_key
        )
    `);
  },

  async enqueueFromPayrollReceipts(companyId: string): Promise<void> {
    if (!(await tableExists("payroll_receipts"))) {
      return;
    }
    await getPool().request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      INSERT INTO company_pending_storage_deletions (company_id, storage_object_key)
      SELECT DISTINCT r.company_id, r.storage_object_key
      FROM payroll_receipts r
      WHERE r.company_id = @companyId
        AND r.storage_object_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM company_pending_storage_deletions p
          WHERE p.company_id = r.company_id AND p.storage_object_key = r.storage_object_key
        )
    `);
  },

  async listDueForDeletion(
    companyId: string,
    now: Date,
  ): Promise<Array<{ id: string; storageObjectKey: string }>> {
    const pending = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("now", sql.DateTime2, now)
      .query(`
        SELECT id, storage_object_key
        FROM company_pending_storage_deletions
        WHERE company_id = @companyId
          AND status IN (N'PENDING', N'FAILED')
          AND (next_attempt_at IS NULL OR next_attempt_at <= @now)
      `);
    return (pending.recordset as Array<{ id: string; storage_object_key: string }>).map(
      (row) => ({
        id: String(row.id),
        storageObjectKey: String(row.storage_object_key),
      }),
    );
  },

  async markDeleted(companyId: string, id: string): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE company_pending_storage_deletions
        SET status = N'DELETED',
            deleted_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            attempts = attempts + 1,
            last_error = NULL,
            next_attempt_at = NULL
        WHERE id = @id AND company_id = @companyId
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  async markFailed(input: {
    companyId: string;
    id: string;
    errorMessage: string;
    nextAttemptAt: Date;
  }): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.id)
      .input("error", sql.NVarChar(1000), input.errorMessage)
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt)
      .query(`
        UPDATE company_pending_storage_deletions
        SET status = N'FAILED',
            updated_at = SYSUTCDATETIME(),
            attempts = attempts + 1,
            last_error = @error,
            next_attempt_at = @nextAttemptAt
        WHERE id = @id AND company_id = @companyId
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  async countIncomplete(companyId: string): Promise<number> {
    const remaining = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(1) AS pending
        FROM company_pending_storage_deletions
        WHERE company_id = @companyId AND status <> N'DELETED'
      `);
    return Number(remaining.recordset[0]?.pending ?? 0);
  },
};
