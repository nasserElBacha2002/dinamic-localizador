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
};
