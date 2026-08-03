import sql from "mssql";
import { getPool } from "../database/connection";
import type { WhatsappConversationStatus } from "../constants/whatsapp-observability";
import type { WhatsappConversation } from "../types/whatsapp-observability";

export const CONVERSATION_IDLE_WINDOW_HOURS = 12;

const mapConversation = (row: Record<string, unknown>): WhatsappConversation => ({
  id: String(row.id),
  companyId: row.company_id ? String(row.company_id) : null,
  employeeId: row.employee_id ? String(row.employee_id) : null,
  phoneHash: String(row.phone_hash),
  phoneMasked: String(row.phone_masked),
  phoneNormalized: String(row.phone_normalized),
  startedAt: new Date(row.started_at as Date | string).toISOString(),
  lastActivityAt: new Date(row.last_activity_at as Date | string).toISOString(),
  status: String(row.status) as WhatsappConversationStatus,
  lastFlowType: row.last_flow_type ? String(row.last_flow_type) : null,
  lastResultCode: row.last_result_code ? String(row.last_result_code) : null,
  messageCount: Number(row.message_count ?? 0),
  errorCount: Number(row.error_count ?? 0),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

export const whatsappConversationRepository = {
  /**
   * Atomically resolve-or-create an open conversation for phone+company within the idle window.
   * Uses UPDLOCK/HOLDLOCK to serialize concurrent creators (project concurrency pattern).
   */
  async resolveOrCreateOpen(input: {
    companyId: string | null;
    employeeId: string | null;
    phoneHash: string;
    phoneMasked: string;
    phoneNormalizedEncrypted: string;
    status?: WhatsappConversationStatus;
  }): Promise<WhatsappConversation> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const request = new sql.Request(transaction)
        .input("phoneHash", sql.NVarChar(64), input.phoneHash)
        .input("idleHours", sql.Int, CONVERSATION_IDLE_WINDOW_HOURS);

      let companyClause = "AND company_id IS NULL";
      if (input.companyId) {
        request.input("companyId", sql.UniqueIdentifier, input.companyId);
        companyClause = "AND company_id = @companyId";
      }

      const existing = await request.query(`
        SELECT TOP 1 *
        FROM whatsapp_conversations WITH (UPDLOCK, HOLDLOCK)
        WHERE phone_hash = @phoneHash
          ${companyClause}
          AND last_activity_at >= DATEADD(HOUR, -@idleHours, SYSUTCDATETIME())
          AND status IN (N'ACTIVE', N'WARNING', N'ERROR')
        ORDER BY last_activity_at DESC
      `);

      if (existing.recordset[0]) {
        const conversation = mapConversation(existing.recordset[0] as Record<string, unknown>);
        if (input.employeeId && !conversation.employeeId) {
          await new sql.Request(transaction)
            .input("id", sql.UniqueIdentifier, conversation.id)
            .input("employeeId", sql.UniqueIdentifier, input.employeeId)
            .query(`
              UPDATE whatsapp_conversations
              SET employee_id = @employeeId,
                  updated_at = SYSUTCDATETIME(),
                  last_activity_at = SYSUTCDATETIME()
              WHERE id = @id
            `);
          conversation.employeeId = input.employeeId;
        }
        await transaction.commit();
        return conversation;
      }

      const created = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("phoneHash", sql.NVarChar(64), input.phoneHash)
        .input("phoneMasked", sql.NVarChar(40), input.phoneMasked)
        .input("phoneNormalized", sql.NVarChar(512), input.phoneNormalizedEncrypted)
        .input("status", sql.NVarChar(20), input.status ?? "ACTIVE")
        .query(`
          INSERT INTO whatsapp_conversations (
            company_id, employee_id, phone_hash, phone_masked, phone_normalized, status
          )
          OUTPUT INSERTED.*
          VALUES (@companyId, @employeeId, @phoneHash, @phoneMasked, @phoneNormalized, @status)
        `);

      await transaction.commit();
      return mapConversation(created.recordset[0] as Record<string, unknown>);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async findOpenByPhoneHash(
    phoneHash: string,
    companyId: string | null,
  ): Promise<WhatsappConversation | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("phoneHash", sql.NVarChar(64), phoneHash)
      .input("idleHours", sql.Int, CONVERSATION_IDLE_WINDOW_HOURS);

    let companyClause = "AND company_id IS NULL";
    if (companyId) {
      request.input("companyId", sql.UniqueIdentifier, companyId);
      companyClause = "AND company_id = @companyId";
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM whatsapp_conversations
      WHERE phone_hash = @phoneHash
        ${companyClause}
        AND last_activity_at >= DATEADD(HOUR, -@idleHours, SYSUTCDATETIME())
      ORDER BY last_activity_at DESC
    `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapConversation(result.recordset[0] as Record<string, unknown>);
  },

  async create(input: {
    companyId: string | null;
    employeeId: string | null;
    phoneHash: string;
    phoneMasked: string;
    phoneNormalized: string;
    status?: WhatsappConversationStatus;
  }): Promise<WhatsappConversation> {
    return this.resolveOrCreateOpen({
      ...input,
      phoneNormalizedEncrypted: input.phoneNormalized,
    });
  },

  async touch(input: {
    conversationId: string;
    employeeId?: string | null;
    lastFlowType?: string | null;
    lastResultCode?: string | null;
    status?: WhatsappConversationStatus;
    incrementMessage?: boolean;
    incrementError?: boolean;
  }): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.conversationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId ?? null)
      .input("lastFlowType", sql.NVarChar(60), input.lastFlowType ?? null)
      .input("lastResultCode", sql.NVarChar(80), input.lastResultCode ?? null)
      .input("status", sql.NVarChar(20), input.status ?? null)
      .input("incMessage", sql.Bit, input.incrementMessage ? 1 : 0)
      .input("incError", sql.Bit, input.incrementError ? 1 : 0)
      .query(`
        UPDATE whatsapp_conversations
        SET last_activity_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            employee_id = COALESCE(@employeeId, employee_id),
            last_flow_type = COALESCE(@lastFlowType, last_flow_type),
            last_result_code = COALESCE(@lastResultCode, last_result_code),
            status = COALESCE(@status, status),
            message_count = message_count + CASE WHEN @incMessage = 1 THEN 1 ELSE 0 END,
            error_count = error_count + CASE WHEN @incError = 1 THEN 1 ELSE 0 END
        WHERE id = @id
      `);
  },

  async findById(id: string): Promise<WhatsappConversation | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM whatsapp_conversations WHERE id = @id`);
    if (!result.recordset[0]) {
      return null;
    }
    return mapConversation(result.recordset[0] as Record<string, unknown>);
  },
};

export { mapConversation as mapWhatsappConversationRow };
