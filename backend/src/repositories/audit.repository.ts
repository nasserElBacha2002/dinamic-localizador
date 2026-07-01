import sql from "mssql";
import { getPool } from "../database/connection";

export const auditRepository = {
  async log(input: {
    companyId: string;
    entityType: string;
    entityId: string;
    action: string;
    previousData?: string | null;
    newData?: string | null;
    reason?: string | null;
    userId?: string | null;
  }): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("entityType", sql.NVarChar(50), input.entityType)
      .input("entityId", sql.UniqueIdentifier, input.entityId)
      .input("action", sql.NVarChar(50), input.action)
      .input("previousData", sql.NVarChar(sql.MAX), input.previousData ?? null)
      .input("newData", sql.NVarChar(sql.MAX), input.newData ?? null)
      .input("reason", sql.NVarChar(500), input.reason ?? null)
      .input("userId", sql.UniqueIdentifier, input.userId ?? null)
      .query(`
        INSERT INTO audit_logs (
          company_id, entity_type, entity_id, action, previous_data, new_data, reason, user_id
        )
        VALUES (
          @companyId, @entityType, @entityId, @action, @previousData, @newData, @reason, @userId
        )
      `);
  },
};
