import type { ConnectionPool } from "mssql";

/** True when migration 171 sender billing columns exist on the connected integration database. */
export const isWhatsappMessageCostMigration171Ready = async (
  pool: ConnectionPool,
): Promise<boolean> => {
  const result = await pool.request().query(`
    SELECT TOP 1 1 AS ready
    FROM sys.columns c
    INNER JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = N'whatsapp_message_cost_ledger'
      AND SCHEMA_NAME(t.schema_id) = N'dbo'
      AND c.name = N'sender_billing_key'
  `);
  return result.recordset.length > 0;
};