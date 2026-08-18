import sql from "mssql";
import { ACTIVE_BOT_SESSION_STATES_SQL } from "../utils/bot-session-states";

export type CompanyLifecycleEventInput = {
  companyId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorUserId: string | null;
  reason: string | null;
  correlationId: string;
  detailsJson?: string | null;
};

/**
 * Persistence helpers for company lifecycle transitions.
 * Status guards / grace-period / purge orchestration stay in the service.
 */
export const companyLifecycleRepository = {
  async insertEvent(
    transaction: sql.Transaction,
    input: CompanyLifecycleEventInput,
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("eventType", sql.NVarChar(60), input.eventType)
      .input("previousStatus", sql.NVarChar(30), input.previousStatus)
      .input("newStatus", sql.NVarChar(30), input.newStatus)
      .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
      .input("reason", sql.NVarChar(500), input.reason)
      .input("correlationId", sql.NVarChar(100), input.correlationId)
      .input("detailsJson", sql.NVarChar(sql.MAX), input.detailsJson ?? null)
      .query(`
        INSERT INTO company_lifecycle_events (
          company_id, event_type, previous_status, new_status,
          actor_user_id, reason, correlation_id, details_json
        )
        VALUES (
          @companyId, @eventType, @previousStatus, @newStatus,
          @actorUserId, @reason, @correlationId, @detailsJson
        )
      `);
  },

  async revokeAccessInTransaction(
    transaction: sql.Transaction,
    companyId: string,
  ): Promise<void> {
    // bot_simulation_sessions has no `state` column (admin sim history only).
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE bot_sessions
        SET state = N'EXPIRED', updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND state IN ${ACTIVE_BOT_SESSION_STATES_SQL};

        UPDATE user_invitations
        SET status = N'REVOKED', updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND status = N'PENDING';
      `);
  },

  async acquireDeactivateAppLock(transaction: sql.Transaction): Promise<number> {
    const lock = await new sql.Request(transaction).query(`
      DECLARE @result INT;
      EXEC @result = sp_getapplock
        @Resource = N'company-lifecycle-deactivate',
        @LockMode = N'Exclusive',
        @LockOwner = N'Transaction',
        @LockTimeout = 15000;
      SELECT @result AS lockResult;
    `);
    return Number(lock.recordset[0]?.lockResult ?? -999);
  },
};
