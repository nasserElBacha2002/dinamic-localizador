/**
 * Batch backfill of WhatsApp message cost ledger from whatsapp_messages.
 *
 * Usage:
 *   npx tsx --import ./src/test-helpers/preload-test-env.ts \
 *     src/scripts/backfill-whatsapp-message-cost-ledger.ts \
 *     --from=2025-01-01 --to=2026-09-01 --batch=200 --dry-run
 */
import { config } from "dotenv";
import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { whatsappMessageCostLedgerWriteRepository } from "../repositories/whatsapp-message-cost-ledger-write.repository";
import { maskPhoneNumberForLog } from "../utils/phone";

config();

const arg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const main = async (): Promise<void> => {
  const dryRun = hasFlag("dry-run");
  const batchSize = Number(arg("batch") ?? "200");
  const from = arg("from");
  const to = arg("to");
  const maxBatches = Number(arg("max-batches") ?? "1000");

  if (!Number.isFinite(batchSize) || batchSize < 1 || batchSize > 2000) {
    throw new Error("Invalid --batch");
  }

  await connectDatabase();
  const pool = getPool();

  let batches = 0;
  let created = 0;
  let existing = 0;
  let skipped = 0;
  let failed = 0;
  let cursorSentAt: Date | null = from ? new Date(from) : null;
  let cursorId: string | null = null;
  const toDate = to ? new Date(to) : null;

  console.info("[backfill-message-cost] start", {
    dryRun,
    batchSize,
    from,
    to,
    maxBatches,
  });

  while (batches < maxBatches) {
    const request = pool.request().input("batchSize", sql.Int, batchSize);
    if (cursorSentAt) {
      request.input("cursorSentAt", sql.DateTime2, cursorSentAt);
    }
    if (cursorId) {
      request.input("cursorId", sql.UniqueIdentifier, cursorId);
    }
    if (toDate) {
      request.input("toDate", sql.DateTime2, toDate);
    }

    const result = await request.query(`
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
        ${toDate ? "AND COALESCE(m.sent_at, m.created_at) < @toDate" : ""}
        ${
          cursorSentAt && cursorId
            ? `AND (
                 COALESCE(m.sent_at, m.created_at) > @cursorSentAt
                 OR (
                   COALESCE(m.sent_at, m.created_at) = @cursorSentAt
                   AND m.id > @cursorId
                 )
               )`
            : cursorSentAt
              ? "AND COALESCE(m.sent_at, m.created_at) >= @cursorSentAt"
              : ""
        }
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.whatsapp_message_cost_ledger l
          WHERE l.provider_message_sid = COALESCE(m.provider_message_sid, m.message_sid)
        )
      ORDER BY COALESCE(m.sent_at, m.created_at) ASC, m.id ASC;
    `);

    const rows = result.recordset as Array<Record<string, unknown>>;
    if (rows.length === 0) {
      break;
    }

    batches += 1;
    for (const row of rows) {
      const sid = row.provider_message_sid ? String(row.provider_message_sid) : null;
      const sentAt = row.sent_at instanceof Date ? row.sent_at : new Date(String(row.sent_at));
      cursorSentAt = sentAt;
      cursorId = String(row.id);

      if (!sid) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        created += 1;
        continue;
      }

      try {
        const messageType = row.message_type ? String(row.message_type) : "TEXT";
        const inserted = await whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate({
          companyId: row.company_id ? String(row.company_id) : null,
          whatsappMessageId: String(row.id),
          providerMessageSid: sid,
          direction: "OUTBOUND",
          sentAt,
          recipientPhoneMasked: row.phone_to
            ? maskPhoneNumberForLog(String(row.phone_to))
            : null,
          messageKind:
            messageType === "DOCUMENT" ? "DOCUMENT" : row.template_sid ? "TEMPLATE" : "TEXT",
          templateSid: row.template_sid ? String(row.template_sid) : null,
          templateName: row.template_name ? String(row.template_name) : null,
          providerStatus: row.provider_status ? String(row.provider_status) : null,
          costQuality: "PENDING",
          costSource: "HISTORICAL_BACKFILL",
          nextSyncAt: new Date(),
        });
        if (inserted) {
          created += 1;
        } else {
          existing += 1;
        }
      } catch (error) {
        failed += 1;
        console.warn("[backfill-message-cost] row failed", {
          id: String(row.id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.info("[backfill-message-cost] batch", {
      batches,
      rows: rows.length,
      created,
      existing,
      skipped,
      failed,
      cursorSentAt: cursorSentAt?.toISOString(),
      cursorId,
    });
  }

  console.info("[backfill-message-cost] done", {
    dryRun,
    batches,
    created,
    existing,
    skipped,
    failed,
  });
  await closeDatabase();
};

main().catch(async (error) => {
  console.error("[backfill-message-cost] fatal", error);
  try {
    await closeDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
