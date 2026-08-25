import sql from "mssql";
import { getPool } from "../database/connection";
import type { AdminAlertTemplateCategory } from "../constants/admin-alert";
import type {
  CompanyAlertRecipient,
  CompanyAlertRecipientInput,
  CompanyAlertRecipientUpdateInput,
} from "../types/company-alert-recipient";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): CompanyAlertRecipient => ({
  id: String(row.id),
  companyId: String(row.company_id),
  userId: row.user_id ? String(row.user_id) : null,
  phoneNumber: String(row.phone_number),
  displayName: row.display_name ? String(row.display_name) : null,
  isEnabled: Boolean(row.is_enabled),
  receiveOperationalAlerts: Boolean(row.receive_operational_alerts),
  receiveRequestAlerts: Boolean(row.receive_request_alerts),
  receiveSecurityAlerts: Boolean(row.receive_security_alerts),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const categoryColumn = (category: AdminAlertTemplateCategory): string => {
  switch (category) {
    case "OPERATIONAL":
      return "receive_operational_alerts";
    case "REQUEST":
      return "receive_request_alerts";
    case "SECURITY":
      return "receive_security_alerts";
    default:
      return "receive_operational_alerts";
  }
};

export const companyAlertRecipientRepository = {
  async listByCompany(companyId: string): Promise<CompanyAlertRecipient[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_alert_recipients
        WHERE company_id = @companyId
        ORDER BY display_name ASC, phone_number ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findById(companyId: string, id: string): Promise<CompanyAlertRecipient | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM company_alert_recipients
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findEnabledRecipients(
    companyId: string,
    category: AdminAlertTemplateCategory,
  ): Promise<CompanyAlertRecipient[]> {
    const column = categoryColumn(category);
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_alert_recipients
        WHERE company_id = @companyId
          AND is_enabled = 1
          AND ${column} = 1
        ORDER BY created_at ASC
      `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async create(
    companyId: string,
    input: CompanyAlertRecipientInput,
  ): Promise<CompanyAlertRecipient> {
    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("userId", sql.UniqueIdentifier, input.userId ?? null)
        .input("phoneNumber", sql.NVarChar(20), input.phoneNumber)
        .input("displayName", sql.NVarChar(200), input.displayName ?? null)
        .input("isEnabled", sql.Bit, input.isEnabled ?? true)
        .input("receiveOperationalAlerts", sql.Bit, input.receiveOperationalAlerts ?? true)
        .input("receiveRequestAlerts", sql.Bit, input.receiveRequestAlerts ?? false)
        .input("receiveSecurityAlerts", sql.Bit, input.receiveSecurityAlerts ?? true)
        .query(`
          INSERT INTO company_alert_recipients (
            company_id, user_id, phone_number, display_name, is_enabled,
            receive_operational_alerts, receive_request_alerts, receive_security_alerts
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @userId, @phoneNumber, @displayName, @isEnabled,
            @receiveOperationalAlerts, @receiveRequestAlerts, @receiveSecurityAlerts
          )
        `);
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("COMPANY_ALERT_RECIPIENT_DUPLICATE_PHONE", { cause: error });
      }
      throw error;
    }
  },

  async update(
    companyId: string,
    id: string,
    input: CompanyAlertRecipientUpdateInput,
  ): Promise<CompanyAlertRecipient | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) {
      return null;
    }

    const sets: string[] = ["updated_at = SYSUTCDATETIME()"];
    const request = getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("id", sql.UniqueIdentifier, id);

    if (input.userId !== undefined) {
      sets.push("user_id = @userId");
      request.input("userId", sql.UniqueIdentifier, input.userId);
    }
    if (input.phoneNumber !== undefined) {
      sets.push("phone_number = @phoneNumber");
      request.input("phoneNumber", sql.NVarChar(20), input.phoneNumber);
    }
    if (input.displayName !== undefined) {
      sets.push("display_name = @displayName");
      request.input("displayName", sql.NVarChar(200), input.displayName);
    }
    if (input.isEnabled !== undefined) {
      sets.push("is_enabled = @isEnabled");
      request.input("isEnabled", sql.Bit, input.isEnabled);
    }
    if (input.receiveOperationalAlerts !== undefined) {
      sets.push("receive_operational_alerts = @receiveOperationalAlerts");
      request.input("receiveOperationalAlerts", sql.Bit, input.receiveOperationalAlerts);
    }
    if (input.receiveRequestAlerts !== undefined) {
      sets.push("receive_request_alerts = @receiveRequestAlerts");
      request.input("receiveRequestAlerts", sql.Bit, input.receiveRequestAlerts);
    }
    if (input.receiveSecurityAlerts !== undefined) {
      sets.push("receive_security_alerts = @receiveSecurityAlerts");
      request.input("receiveSecurityAlerts", sql.Bit, input.receiveSecurityAlerts);
    }

    try {
      const result = await request.query(`
        UPDATE company_alert_recipients
        SET ${sets.join(", ")}
        OUTPUT INSERTED.*
        WHERE company_id = @companyId AND id = @id
      `);
      const row = result.recordset[0] as Record<string, unknown> | undefined;
      return row ? mapRow(row) : null;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new Error("COMPANY_ALERT_RECIPIENT_DUPLICATE_PHONE", { cause: error });
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
        UPDATE company_alert_recipients
        SET is_enabled = 0, updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @id
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
