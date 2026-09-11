import sql from "mssql";
import { getPool } from "../database/connection";
import {
  mapLedgerRow,
  type WhatsappMessageCostLedgerRow,
} from "./whatsapp-message-cost-ledger.types";

export const whatsappMessageCostLedgerClaimRepository = {
  async claimNextPending(
    workerId: string,
    leaseSeconds: number,
    maxAttempts: number,
  ): Promise<WhatsappMessageCostLedgerRow | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("leaseOwner", sql.NVarChar(100), workerId)
        .input("leaseSeconds", sql.Int, leaseSeconds)
        .input("maxAttempts", sql.Int, maxAttempts)
        .query(`
          ;WITH next_row AS (
            SELECT TOP (1) id
            FROM dbo.whatsapp_message_cost_ledger WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE cost_quality = N'PENDING'
              AND provider_message_sid IS NOT NULL
              AND sync_attempt_count < @maxAttempts
              AND (next_sync_at IS NULL OR next_sync_at <= SYSUTCDATETIME())
              AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
            ORDER BY COALESCE(next_sync_at, created_at) ASC, created_at ASC
          )
          UPDATE l
          SET sync_attempt_count = sync_attempt_count + 1,
              lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          FROM dbo.whatsapp_message_cost_ledger l
          INNER JOIN next_row r ON r.id = l.id
          WHERE l.cost_quality = N'PENDING'
            AND l.provider_message_sid IS NOT NULL;
        `);

      await transaction.commit();
      if (!result.recordset[0]) {
        return null;
      }
      return mapLedgerRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  /**
   * Resync without stealing active leases.
   * Resets attempts and clears errors only for rows that become eligible.
   */
  async requestResync(input: {
    companyId?: string;
    monthStartUtc: Date;
    nextMonthStartUtc: Date;
    ledgerIds?: string[];
    maxRows: number;
  }): Promise<number> {
    const pool = getPool();
    const request = pool
      .request()
      .input("monthStartUtc", sql.DateTime2, input.monthStartUtc)
      .input("nextMonthStartUtc", sql.DateTime2, input.nextMonthStartUtc)
      .input("maxRows", sql.Int, input.maxRows);

    const clauses = [
      "direction = N'OUTBOUND'",
      "provider_message_sid IS NOT NULL",
      "sent_at >= @monthStartUtc",
      "sent_at < @nextMonthStartUtc",
      "cost_quality IN (N'PENDING', N'UNAVAILABLE', N'ESTIMATED')",
      "(lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())",
    ];

    if (input.companyId) {
      request.input("companyId", sql.UniqueIdentifier, input.companyId);
      clauses.push("company_id = @companyId");
    }

    if (input.ledgerIds && input.ledgerIds.length > 0) {
      const idList = input.ledgerIds.slice(0, input.maxRows);
      const placeholders = idList.map((_, i) => {
        const name = `ledgerId${i}`;
        request.input(name, sql.UniqueIdentifier, idList[i]);
        return `@${name}`;
      });
      clauses.push(`id IN (${placeholders.join(", ")})`);
    }

    const result = await request.query(`
      ;WITH eligible AS (
        SELECT TOP (@maxRows) id
        FROM dbo.whatsapp_message_cost_ledger
        WHERE ${clauses.join("\n          AND ")}
        ORDER BY sent_at DESC
      )
      UPDATE l
      SET cost_quality = N'PENDING',
          sync_attempt_count = 0,
          next_sync_at = SYSUTCDATETIME(),
          lease_owner = NULL,
          lease_expires_at = NULL,
          last_sync_error_code = NULL,
          last_sync_error_message = NULL,
          updated_at = SYSUTCDATETIME()
      FROM dbo.whatsapp_message_cost_ledger l
      INNER JOIN eligible e ON e.id = l.id
      WHERE (l.lease_expires_at IS NULL OR l.lease_expires_at < SYSUTCDATETIME());
    `);
    return result.rowsAffected[0] ?? 0;
  },
};
