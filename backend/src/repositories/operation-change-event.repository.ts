import sql from "mssql";
import { getPool } from "../database/connection";

export type OperationChangeAction =
  | "UPDATE"
  | "CANCEL"
  | "REACTIVATE"
  | "RESCHEDULE"
  | "ASSIGNMENT_CHANGE";

export type InsertOperationChangeEventInput = {
  companyId: string;
  operationId: string;
  operationalDate: string;
  changeAction: OperationChangeAction;
  changedFields: string[];
  actorUserId?: string | null;
  source?: "HUMAN_API" | "SYSTEM_EXCLUDED";
  reason?: string | null;
  occurredAt?: Date;
};

/**
 * Test-only seam: runs immediately before the operation_change_events INSERT so
 * unit/integration tests can force a failure inside an open business transaction.
 * Production never sets this.
 */
type ChangeEventBeforeInsertHook = (
  input: InsertOperationChangeEventInput,
) => Promise<void>;

let changeEventBeforeInsertHookForTests: ChangeEventBeforeInsertHook | undefined;

export const setOperationChangeEventBeforeInsertHookForTests = (
  hook: ChangeEventBeforeInsertHook | undefined,
): void => {
  changeEventBeforeInsertHookForTests = hook;
};

export const operationChangeEventRepository = {
  async insert(
    input: InsertOperationChangeEventInput,
    transaction?: sql.Transaction,
  ): Promise<void> {
    if (input.changedFields.length === 0 && input.changeAction === "UPDATE") {
      return;
    }

    if (changeEventBeforeInsertHookForTests) {
      await changeEventBeforeInsertHookForTests(input);
    }

    const request = transaction ? new sql.Request(transaction) : getPool().request();
    await request
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("operationalDate", sql.Date, input.operationalDate)
      .input("changeAction", sql.NVarChar(40), input.changeAction)
      .input("changedFieldsJson", sql.NVarChar(sql.MAX), JSON.stringify(input.changedFields))
      .input("actorUserId", sql.UniqueIdentifier, input.actorUserId ?? null)
      .input("source", sql.NVarChar(40), input.source ?? "HUMAN_API")
      .input("reason", sql.NVarChar(500), input.reason ?? null)
      .input("occurredAt", sql.DateTime2, input.occurredAt ?? new Date())
      .query(`
        INSERT INTO operation_change_events (
          company_id, operation_id, operational_date, change_action,
          changed_fields_json, actor_user_id, source, reason, occurred_at
        )
        VALUES (
          @companyId, @operationId, @operationalDate, @changeAction,
          @changedFieldsJson, @actorUserId, @source, @reason, @occurredAt
        )
      `);
  },
};
