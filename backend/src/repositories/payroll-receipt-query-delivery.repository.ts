import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../utils/sql-server-errors";

/**
 * ACCEPTED = Twilio accepted messages.create for this receipt in this query.
 * Not a provider delivery-receipt callback. Retry skips ACCEPTED only.
 */
export type PayrollReceiptQueryDeliveryStatus =
  | "PENDING"
  | "PROCESSING"
  | "SEND_STARTED"
  | "ACCEPTED"
  | "FAILED"
  | "RECONCILIATION_REQUIRED";

export type PayrollReceiptQueryDelivery = {
  id: string;
  companyId: string;
  botSessionId: string;
  payrollReceiptId: string;
  employeeId: string;
  year: number;
  month: number;
  status: PayrollReceiptQueryDeliveryStatus;
  providerMessageSid: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  acceptedAt: string | null;
  processingToken?: string | null;
  processingVersion?: number;
  processingExpiresAt?: string | null;
  sendStartedAt?: string | null;
  reconciliationRequiredAt?: string | null;
  reconciliationCommandId?: string | null;
  reconciliationResolution?: PayrollReceiptQueryReconciliationResolution | null;
  reconciliationReason?: string | null;
  reconciledAt?: string | null;
  reconciledByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollReceiptQueryReconciliationResolution =
  | "CONFIRMED_ACCEPTED"
  | "CONFIRMED_NOT_SENT";

export type PayrollReceiptQueryKey = {
  companyId: string;
  botSessionId: string;
  employeeId: string;
  year: number;
  month: number;
};

export type PayrollReceiptQueryDeliveryClaim = PayrollReceiptQueryDelivery & {
  processingToken: string;
  processingVersion: number;
};

const mapRow = (row: Record<string, unknown>): PayrollReceiptQueryDelivery => ({
  id: String(row.id),
  companyId: String(row.company_id),
  botSessionId: String(row.bot_session_id),
  payrollReceiptId: String(row.payroll_receipt_id),
  employeeId: String(row.employee_id),
  year: Number(row.year),
  month: Number(row.month),
  status: String(row.status) as PayrollReceiptQueryDeliveryStatus,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  acceptedAt: row.accepted_at ? new Date(String(row.accepted_at)).toISOString() : null,
  processingToken: row.processing_token ? String(row.processing_token) : null,
  processingVersion: Number(row.processing_version ?? 0),
  processingExpiresAt: row.processing_expires_at
    ? new Date(String(row.processing_expires_at)).toISOString()
    : null,
  sendStartedAt: row.send_started_at ? new Date(String(row.send_started_at)).toISOString() : null,
  reconciliationRequiredAt: row.reconciliation_required_at
    ? new Date(String(row.reconciliation_required_at)).toISOString()
    : null,
  reconciliationCommandId: row.reconciliation_command_id
    ? String(row.reconciliation_command_id)
    : null,
  reconciliationResolution: row.reconciliation_resolution
    ? (String(row.reconciliation_resolution) as PayrollReceiptQueryReconciliationResolution)
    : null,
  reconciliationReason: row.reconciliation_reason
    ? String(row.reconciliation_reason)
    : null,
  reconciledAt: row.reconciled_at
    ? new Date(String(row.reconciled_at)).toISOString()
    : null,
  reconciledByUserId: row.reconciled_by_user_id
    ? String(row.reconciled_by_user_id)
    : null,
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

const isExpectedDeliveryUniqueViolation = (error: unknown): boolean => {
  if (!isDuplicateKeyError(error)) {
    return false;
  }
  const constraint = getDuplicateKeyConstraint(error);
  return (
    constraint === null ||
    constraint === "UQ_wprqd_session_period_receipt" ||
    constraint.includes("wprqd_session_period")
  );
};

/**
 * Logical query identity = company + bot_session + employee + year + month.
 * Same open session retrying the same period skips ACCEPTED.
 * Changing period within the session uses a separate delivery set.
 * New bot session = new consultation = can resend all.
 */
export const payrollReceiptQueryDeliveryRepository = {
  async confirmAcceptedByProviderMessageSid(providerMessageSid: string): Promise<number> {
    const result = await getPool()
      .request()
      .input("providerMessageSid", sql.NVarChar(100), providerMessageSid)
      .query(`
        UPDATE dbo.whatsapp_payroll_receipt_query_deliveries
        SET status = N'ACCEPTED',
            accepted_at = COALESCE(accepted_at, SYSUTCDATETIME()),
            reconciliation_required_at = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            processing_token = NULL,
            processing_expires_at = NULL,
            processing_version = processing_version + 1,
            updated_at = SYSUTCDATETIME()
        WHERE provider_message_sid = @providerMessageSid
          AND status = N'RECONCILIATION_REQUIRED'
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  async listReconciliationRequired(
    companyId: string,
  ): Promise<PayrollReceiptQueryDelivery[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM dbo.whatsapp_payroll_receipt_query_deliveries
        WHERE company_id = @companyId
          AND status = N'RECONCILIATION_REQUIRED'
        ORDER BY reconciliation_required_at ASC, id ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapRow);
  },

  async findForReconciliation(
    companyId: string,
    deliveryId: string,
    transaction?: sql.Transaction,
  ): Promise<PayrollReceiptQueryDelivery | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("deliveryId", sql.UniqueIdentifier, deliveryId)
      .query(`
        SELECT TOP (1) *
        FROM dbo.whatsapp_payroll_receipt_query_deliveries
        ${transaction ? "WITH (UPDLOCK, HOLDLOCK)" : ""}
        WHERE id = @deliveryId
          AND company_id = @companyId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByReconciliationCommandId(
    commandId: string,
  ): Promise<PayrollReceiptQueryDelivery | null> {
    const result = await getPool()
      .request()
      .input("commandId", sql.UniqueIdentifier, commandId)
      .query(`
        SELECT TOP (1) *
        FROM dbo.whatsapp_payroll_receipt_query_deliveries
        WHERE reconciliation_command_id = @commandId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async applyReconciliation(
    input: {
      companyId: string;
      deliveryId: string;
      expectedProcessingVersion: number;
      commandId: string;
      resolution: PayrollReceiptQueryReconciliationResolution;
      reason: string;
      providerMessageSid: string | null;
      reconciledByUserId: string;
    },
    transaction: sql.Transaction,
  ): Promise<PayrollReceiptQueryDelivery | null> {
    const nextStatus =
      input.resolution === "CONFIRMED_ACCEPTED" ? "ACCEPTED" : "PENDING";
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("deliveryId", sql.UniqueIdentifier, input.deliveryId)
      .input("expectedProcessingVersion", sql.Int, input.expectedProcessingVersion)
      .input("commandId", sql.UniqueIdentifier, input.commandId)
      .input("resolution", sql.NVarChar(30), input.resolution)
      .input("reason", sql.NVarChar(500), input.reason)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("reconciledByUserId", sql.UniqueIdentifier, input.reconciledByUserId)
      .input("nextStatus", sql.NVarChar(30), nextStatus)
      .query(`
        UPDATE dbo.whatsapp_payroll_receipt_query_deliveries
        SET status = @nextStatus,
            provider_message_sid = CASE
              WHEN @resolution = N'CONFIRMED_ACCEPTED' THEN @providerMessageSid
              ELSE NULL
            END,
            accepted_at = CASE
              WHEN @resolution = N'CONFIRMED_ACCEPTED' THEN SYSUTCDATETIME()
              ELSE NULL
            END,
            processing_token = NULL,
            processing_expires_at = NULL,
            send_started_at = CASE
              WHEN @resolution = N'CONFIRMED_NOT_SENT' THEN NULL
              ELSE send_started_at
            END,
            reconciliation_command_id = @commandId,
            reconciliation_resolution = @resolution,
            reconciliation_reason = @reason,
            reconciled_at = SYSUTCDATETIME(),
            reconciled_by_user_id = @reconciledByUserId,
            last_error_code = NULL,
            last_error_message = NULL,
            processing_version = processing_version + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @deliveryId
          AND company_id = @companyId
          AND status = N'RECONCILIATION_REQUIRED'
          AND processing_version = @expectedProcessingVersion
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async ensurePendingDeliveries(input: {
    companyId: string;
    botSessionId: string;
    employeeId: string;
    year: number;
    month: number;
    payrollReceiptIds: string[];
  }): Promise<void> {
    if (input.payrollReceiptIds.length === 0) {
      return;
    }
    const pool = getPool();
    for (const payrollReceiptId of input.payrollReceiptIds) {
      try {
        // Insert only when receipt matches company/employee/period (integrity).
        // Unique index is the final concurrency backstop.
        await pool
          .request()
          .input("companyId", sql.UniqueIdentifier, input.companyId)
          .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
          .input("payrollReceiptId", sql.UniqueIdentifier, payrollReceiptId)
          .input("employeeId", sql.UniqueIdentifier, input.employeeId)
          .input("year", sql.Int, input.year)
          .input("month", sql.Int, input.month)
          .query(`
            INSERT INTO whatsapp_payroll_receipt_query_deliveries (
              company_id, bot_session_id, payroll_receipt_id, employee_id, year, month, status
            )
            SELECT
              @companyId, @botSessionId, @payrollReceiptId, @employeeId, @year, @month, N'PENDING'
            WHERE EXISTS (
              SELECT 1
              FROM payroll_receipts r
              WHERE r.id = @payrollReceiptId
                AND r.company_id = @companyId
                AND r.employee_id = @employeeId
                AND r.year = @year
                AND r.month = @month
                AND r.status = N'ASSOCIATED'
                AND r.deleted_at IS NULL
            );
          `);
      } catch (error) {
        if (isExpectedDeliveryUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }
  },

  async listForQuery(key: PayrollReceiptQueryKey): Promise<PayrollReceiptQueryDelivery[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, key.companyId)
      .input("botSessionId", sql.UniqueIdentifier, key.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, key.employeeId)
      .input("year", sql.Int, key.year)
      .input("month", sql.Int, key.month)
      .query(`
        SELECT d.*
        FROM whatsapp_payroll_receipt_query_deliveries d
        INNER JOIN payroll_receipts r
          ON r.id = d.payroll_receipt_id AND r.company_id = d.company_id
        WHERE d.company_id = @companyId
          AND d.bot_session_id = @botSessionId
          AND d.employee_id = @employeeId
          AND d.year = @year
          AND d.month = @month
        ORDER BY r.created_at ASC, r.id ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapRow);
  },

  async claimForSend(input: PayrollReceiptQueryKey & {
    payrollReceiptId: string;
    leaseMs: number;
  }): Promise<PayrollReceiptQueryDeliveryClaim | null> {
    const processingToken = randomUUID();
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("processingToken", sql.UniqueIdentifier, processingToken)
      .input("leaseMs", sql.Int, input.leaseMs)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries WITH (UPDLOCK, ROWLOCK)
        SET status = N'PROCESSING',
            processing_token = @processingToken,
            processing_version = processing_version + 1,
            processing_expires_at = DATEADD(millisecond, @leaseMs, SYSUTCDATETIME()),
            send_started_at = NULL,
            reconciliation_required_at = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
          AND (
            status IN (N'PENDING', N'FAILED')
            OR (
              status = N'PROCESSING'
              AND processing_expires_at < SYSUTCDATETIME()
            )
          )
      `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const mapped = mapRow(row);
    if (!mapped.processingToken || mapped.processingVersion == null) {
      throw new Error("PAYROLL_QUERY_DELIVERY_CLAIM_INVALID");
    }
    return mapped as PayrollReceiptQueryDeliveryClaim;
  },

  async markSendStarted(input: PayrollReceiptQueryKey & {
    payrollReceiptId: string;
    processingToken: string;
    processingVersion: number;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("processingToken", sql.UniqueIdentifier, input.processingToken)
      .input("processingVersion", sql.Int, input.processingVersion)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries
        SET status = N'SEND_STARTED',
            send_started_at = SYSUTCDATETIME(),
            processing_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
          AND status = N'PROCESSING'
          AND processing_token = @processingToken
          AND processing_version = @processingVersion
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async markAccepted(input: {
    companyId: string;
    botSessionId: string;
    employeeId: string;
    year: number;
    month: number;
    payrollReceiptId: string;
    processingToken: string;
    processingVersion: number;
    providerMessageSid?: string | null;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("processingToken", sql.UniqueIdentifier, input.processingToken)
      .input("processingVersion", sql.Int, input.processingVersion)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid ?? null)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries
        SET status = N'ACCEPTED',
            provider_message_sid = COALESCE(@providerMessageSid, provider_message_sid),
            last_error_code = NULL,
            last_error_message = NULL,
            accepted_at = SYSUTCDATETIME(),
            processing_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
          AND status = N'SEND_STARTED'
          AND processing_token = @processingToken
          AND processing_version = @processingVersion
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async markFailedBeforeSend(input: {
    companyId: string;
    botSessionId: string;
    employeeId: string;
    year: number;
    month: number;
    payrollReceiptId: string;
    processingToken: string;
    processingVersion: number;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("processingToken", sql.UniqueIdentifier, input.processingToken)
      .input("processingVersion", sql.Int, input.processingVersion)
      .input("errorCode", sql.NVarChar(80), input.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries
        SET status = N'FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            processing_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
          AND status = N'PROCESSING'
          AND processing_token = @processingToken
          AND processing_version = @processingVersion
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },

  async markReconciliationRequired(input: PayrollReceiptQueryKey & {
    payrollReceiptId: string;
    processingToken: string;
    processingVersion: number;
    providerMessageSid?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("processingToken", sql.UniqueIdentifier, input.processingToken)
      .input("processingVersion", sql.Int, input.processingVersion)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid ?? null)
      .input("errorCode", sql.NVarChar(80), input.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries
        SET status = N'RECONCILIATION_REQUIRED',
            provider_message_sid = COALESCE(@providerMessageSid, provider_message_sid),
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            reconciliation_required_at = SYSUTCDATETIME(),
            processing_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
          AND status = N'SEND_STARTED'
          AND processing_token = @processingToken
          AND processing_version = @processingVersion
      `);
    return Number(result.rowsAffected[0] ?? 0) === 1;
  },
};
