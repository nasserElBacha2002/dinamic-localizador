import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  CompanyReportEmailRecipient,
  CompanyReportEmailRecipientInput,
  CompanyReportEmailRecipientUpdateInput,
} from "../types/daily-attendance-report";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import {
  isValidReportEmail,
  normalizeReportEmail,
} from "../utils/daily-attendance-report-email";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): CompanyReportEmailRecipient => ({
  id: String(row.id),
  companyId: String(row.company_id),
  email: String(row.email),
  displayName: row.display_name ? String(row.display_name) : null,
  isEnabled: Boolean(row.is_enabled),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

export const companyReportEmailRecipientRepository = {
  async listByCompany(companyId: string): Promise<CompanyReportEmailRecipient[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_report_email_recipients
        WHERE company_id = @companyId
        ORDER BY display_name ASC, email ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findById(
    companyId: string,
    id: string,
  ): Promise<CompanyReportEmailRecipient | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM company_report_email_recipients
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async listEnabled(companyId: string): Promise<CompanyReportEmailRecipient[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_report_email_recipients
        WHERE company_id = @companyId AND is_enabled = 1
        ORDER BY created_at ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async create(
    companyId: string,
    input: CompanyReportEmailRecipientInput,
  ): Promise<CompanyReportEmailRecipient> {
    const email = normalizeReportEmail(input.email);
    if (!isValidReportEmail(email)) {
      throw Object.assign(new Error("INVALID_EMAIL"), { code: "INVALID_EMAIL" });
    }
    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("email", sql.NVarChar(320), email)
        .input("displayName", sql.NVarChar(200), input.displayName ?? null)
        .input("isEnabled", sql.Bit, input.isEnabled ?? true)
        .query(`
          INSERT INTO company_report_email_recipients (
            company_id, email, display_name, is_enabled
          )
          OUTPUT INSERTED.*
          VALUES (@companyId, @email, @displayName, @isEnabled)
        `);
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw Object.assign(new Error("DUPLICATE_EMAIL"), { code: "DUPLICATE_EMAIL" });
      }
      throw error;
    }
  },

  async update(
    companyId: string,
    id: string,
    input: CompanyReportEmailRecipientUpdateInput,
  ): Promise<CompanyReportEmailRecipient | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) {
      return null;
    }
    const email =
      input.email !== undefined ? normalizeReportEmail(input.email) : existing.email;
    if (!isValidReportEmail(email)) {
      throw Object.assign(new Error("INVALID_EMAIL"), { code: "INVALID_EMAIL" });
    }
    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("id", sql.UniqueIdentifier, id)
        .input("email", sql.NVarChar(320), email)
        .input(
          "displayName",
          sql.NVarChar(200),
          input.displayName !== undefined ? input.displayName : existing.displayName,
        )
        .input(
          "isEnabled",
          sql.Bit,
          input.isEnabled !== undefined ? input.isEnabled : existing.isEnabled,
        )
        .query(`
          UPDATE company_report_email_recipients
          SET email = @email,
              display_name = @displayName,
              is_enabled = @isEnabled,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE company_id = @companyId AND id = @id
        `);
      const row = result.recordset[0] as Record<string, unknown> | undefined;
      return row ? mapRow(row) : null;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw Object.assign(new Error("DUPLICATE_EMAIL"), { code: "DUPLICATE_EMAIL" });
      }
      throw error;
    }
  },

  async disable(companyId: string, id: string): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE company_report_email_recipients
        SET is_enabled = 0, updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @id AND is_enabled = 1
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
