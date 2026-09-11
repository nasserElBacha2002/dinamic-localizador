import sql from "mssql";
import { getPool } from "../database/connection";

export type PlatformAuditInsertInput = {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  result: "SUCCESS" | "DENIED" | "ERROR";
};

export const platformAuditRepository = {
  async log(input: PlatformAuditInsertInput): Promise<void> {
    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("action", sql.NVarChar(80), input.action)
      .input("entityType", sql.NVarChar(80), input.entityType)
      .input("entityId", sql.UniqueIdentifier, input.entityId)
      .input("result", sql.NVarChar(40), input.result)
      .query(`
        INSERT INTO platform_audit_logs (user_id, action, entity_type, entity_id, result)
        VALUES (@userId, @action, @entityType, @entityId, @result)
      `);
  },
};
