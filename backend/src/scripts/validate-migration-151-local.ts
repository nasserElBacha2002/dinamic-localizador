#!/usr/bin/env tsx
/**
 * Local/staging READ evidence for migration 151 indexes (not a deploy hook).
 */
import { config } from "dotenv";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";

config();

const NAMES = [
  "IX_wm_outbound_sent_at",
  "IX_wan_company_sent_recovery",
  "IX_wc_active_last_activity",
  "IX_wfe_started_unfinished",
] as const;

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const present = await getPool().request().query(`
      SELECT i.name, OBJECT_NAME(i.object_id) AS table_name, i.filter_definition,
             ius.user_seeks, ius.user_scans, ius.user_lookups, ius.user_updates
      FROM sys.indexes i
      LEFT JOIN sys.dm_db_index_usage_stats ius
        ON ius.database_id = DB_ID() AND ius.object_id = i.object_id AND ius.index_id = i.index_id
      WHERE i.name IN (
        N'IX_wm_outbound_sent_at', N'IX_wan_company_sent_recovery',
        N'IX_wc_active_last_activity', N'IX_wfe_started_unfinished'
      )
      ORDER BY i.name
    `);
    const found = new Set(
      (present.recordset as Array<{ name: string }>).map((r) => r.name),
    );
    for (const name of NAMES) {
      console.log(`PRESENT ${name}=${found.has(name) ? "yes" : "NO"}`);
    }
    for (const row of present.recordset as Array<Record<string, unknown>>) {
      console.log(
        "USAGE",
        row.name,
        "seeks=",
        Number(row.user_seeks ?? 0),
        "scans=",
        Number(row.user_scans ?? 0),
        "updates=",
        Number(row.user_updates ?? 0),
      );
    }

    // Drive a seek/scan against the outbound filtered index + anti-join shape.
    const stats = await getPool().request().query(`
      SET STATISTICS IO ON;
      SELECT TOP (50)
        m.id
      FROM dbo.whatsapp_messages m
      WHERE m.direction = N'OUTBOUND'
        AND (
          (
            m.provider_message_sid IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM dbo.whatsapp_message_cost_ledger l
              WHERE l.provider_message_sid = m.provider_message_sid
            )
          )
          OR (
            m.provider_message_sid IS NULL
            AND m.message_sid IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM dbo.whatsapp_message_cost_ledger l
              WHERE l.provider_message_sid = m.message_sid
            )
          )
        )
      ORDER BY COALESCE(m.sent_at, m.created_at) ASC;
      SET STATISTICS IO OFF;
    `);
    console.log("RECONCILE_PROBE_ROWS", stats.recordset?.length ?? 0);

    const usageAfter = await getPool().request().query(`
      SELECT i.name, ius.user_seeks, ius.user_scans, ius.user_lookups
      FROM sys.indexes i
      LEFT JOIN sys.dm_db_index_usage_stats ius
        ON ius.database_id = DB_ID() AND ius.object_id = i.object_id AND ius.index_id = i.index_id
      WHERE i.name = N'IX_wm_outbound_sent_at'
    `);
    const u = usageAfter.recordset[0] as Record<string, unknown> | undefined;
    console.log(
      "IX_wm_outbound_sent_at_AFTER_PROBE seeks=",
      Number(u?.user_seeks ?? 0),
      "scans=",
      Number(u?.user_scans ?? 0),
    );
    console.log(
      "NOTE ORDER BY COALESCE(sent_at, created_at) may still require a sort; " +
        "keep index only if seeks/scans show OUTBOUND filter/cover benefit.",
    );

    // Lifecycle-shaped probes for the other three indexes
    await getPool().request().query(`
      SELECT TOP (5) c.id FROM dbo.whatsapp_conversations c
      WHERE c.status = N'ACTIVE' AND c.last_activity_at < DATEADD(HOUR, -24, SYSUTCDATETIME())
      ORDER BY c.last_activity_at ASC;
    `);
    await getPool().request().query(`
      SELECT TOP (5) id FROM dbo.whatsapp_flow_executions
      WHERE status = N'STARTED' AND finished_at IS NULL
        AND started_at < DATEADD(HOUR, -24, SYSUTCDATETIME())
      ORDER BY started_at ASC;
    `);
    await getPool().request().query(`
      SELECT TOP (5) company_id FROM dbo.whatsapp_attendance_notifications
      WHERE status = N'SENT_RECOVERY_REQUIRED';
    `);

    const usageAll = await getPool().request().query(`
      SELECT i.name, ius.user_seeks, ius.user_scans
      FROM sys.indexes i
      LEFT JOIN sys.dm_db_index_usage_stats ius
        ON ius.database_id = DB_ID() AND ius.object_id = i.object_id AND ius.index_id = i.index_id
      WHERE i.name IN (
        N'IX_wm_outbound_sent_at', N'IX_wan_company_sent_recovery',
        N'IX_wc_active_last_activity', N'IX_wfe_started_unfinished'
      )
      ORDER BY i.name
    `);
    for (const row of usageAll.recordset as Array<Record<string, unknown>>) {
      console.log(
        "AFTER_PROBES",
        row.name,
        "seeks=",
        Number(row.user_seeks ?? 0),
        "scans=",
        Number(row.user_scans ?? 0),
      );
    }
  } finally {
    await closeDatabase();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
