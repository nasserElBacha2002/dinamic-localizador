import sql from "mssql";
import { getPool } from "../database/connection";
import { whatsappMessageCostLedgerWriteRepository } from "../repositories/whatsapp-message-cost-ledger-write.repository";
import { maskPhoneNumberForLog } from "../utils/phone";

export interface CostLedgerReconcileResult {
  found: number;
  created: number;
  existing: number;
  skipped: number;
  failed: number;
}

/**
 * Durable recovery: Twilio-accepted outbound rows in whatsapp_messages
 * that lack a cost ledger row. Idempotent via unique provider_message_sid.
 */
export const whatsappMessageCostReconcileService = {
  async reconcileMissingLedgerFromMessages(batchSize = 100): Promise<CostLedgerReconcileResult> {
    const result: CostLedgerReconcileResult = {
      found: 0,
      created: 0,
      existing: 0,
      skipped: 0,
      failed: 0,
    };

    const pool = getPool();
    const selected = await pool.request().input("batchSize", sql.Int, batchSize).query(`
      SELECT TOP (@batchSize)
        m.id,
        m.company_id,
        COALESCE(m.provider_message_sid, m.message_sid) AS provider_message_sid,
        COALESCE(m.sent_at, m.created_at) AS sent_at,
        m.phone_to,
        m.message_type,
        m.template_sid,
        m.template_name,
        m.provider_status
      FROM dbo.whatsapp_messages m
      WHERE m.direction = N'OUTBOUND'
        AND COALESCE(m.provider_message_sid, m.message_sid) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.whatsapp_message_cost_ledger l
          WHERE l.provider_message_sid = COALESCE(m.provider_message_sid, m.message_sid)
        )
      ORDER BY COALESCE(m.sent_at, m.created_at) ASC;
    `);

    const rows = selected.recordset as Array<Record<string, unknown>>;
    result.found = rows.length;

    for (const row of rows) {
      const sid = row.provider_message_sid ? String(row.provider_message_sid) : null;
      if (!sid) {
        result.skipped += 1;
        continue;
      }

      try {
        const messageType = row.message_type ? String(row.message_type) : "TEXT";
        const messageKind =
          messageType === "DOCUMENT"
            ? "DOCUMENT"
            : row.template_sid
              ? "TEMPLATE"
              : "TEXT";

        const inserted = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
          companyId: row.company_id ? String(row.company_id) : null,
          whatsappMessageId: String(row.id),
          providerMessageSid: sid,
          direction: "OUTBOUND",
          sentAt: row.sent_at instanceof Date ? row.sent_at : new Date(String(row.sent_at)),
          recipientPhoneMasked: row.phone_to
            ? maskPhoneNumberForLog(String(row.phone_to))
            : null,
          messageKind,
          templateSid: row.template_sid ? String(row.template_sid) : null,
          templateName: row.template_name ? String(row.template_name) : null,
          providerStatus: row.provider_status ? String(row.provider_status) : "SEND_ACCEPTED",
          costQuality: "PENDING",
          costSource: "HISTORICAL_BACKFILL",
          nextSyncAt: new Date(),
        });

        if (inserted) {
          result.created += 1;
        } else {
          result.existing += 1;
        }
      } catch (error) {
        result.failed += 1;
        console.warn("[whatsapp-message-cost-reconcile] insert failed", {
          messageId: String(row.id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  },
};
