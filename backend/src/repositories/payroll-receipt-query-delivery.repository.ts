import sql from "mssql";
import { getPool } from "../database/connection";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../utils/sql-server-errors";

/**
 * ACCEPTED = Twilio accepted messages.create for this receipt in this query.
 * Not a provider delivery-receipt callback. Retry skips ACCEPTED only.
 */
export type PayrollReceiptQueryDeliveryStatus = "PENDING" | "ACCEPTED" | "FAILED";

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
  createdAt: string;
  updatedAt: string;
};

export type PayrollReceiptQueryKey = {
  companyId: string;
  botSessionId: string;
  employeeId: string;
  year: number;
  month: number;
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

  async markAccepted(input: {
    companyId: string;
    botSessionId: string;
    employeeId: string;
    year: number;
    month: number;
    payrollReceiptId: string;
    providerMessageSid?: string | null;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid ?? null)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries
        SET status = N'ACCEPTED',
            provider_message_sid = COALESCE(@providerMessageSid, provider_message_sid),
            last_error_code = NULL,
            last_error_message = NULL,
            accepted_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
      `);
  },

  async markFailed(input: {
    companyId: string;
    botSessionId: string;
    employeeId: string;
    year: number;
    month: number;
    payrollReceiptId: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("botSessionId", sql.UniqueIdentifier, input.botSessionId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("year", sql.Int, input.year)
      .input("month", sql.Int, input.month)
      .input("payrollReceiptId", sql.UniqueIdentifier, input.payrollReceiptId)
      .input("errorCode", sql.NVarChar(80), input.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .query(`
        UPDATE whatsapp_payroll_receipt_query_deliveries
        SET status = N'FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND bot_session_id = @botSessionId
          AND employee_id = @employeeId
          AND year = @year
          AND month = @month
          AND payroll_receipt_id = @payrollReceiptId
          AND status <> N'ACCEPTED'
      `);
  },
};
