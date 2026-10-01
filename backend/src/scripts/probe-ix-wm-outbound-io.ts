#!/usr/bin/env tsx
/**
 * Staging IO comparison for IX_wm_outbound_sent_at (READ-ONLY probes).
 * Captures logical reads via SET STATISTICS IO and reports KEEP/DROP input.
 */
import { config } from "dotenv";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";

config();

const ANTIJOIN = `
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
`;

function buildSql(fromClause: string): string {
  return `
SELECT TOP (50)
  m.id,
  COALESCE(m.provider_message_sid, m.message_sid) AS provider_message_sid
FROM ${fromClause}
WHERE m.direction = N'OUTBOUND'
${ANTIJOIN}
ORDER BY COALESCE(m.sent_at, m.created_at) ASC;
`;
}

async function captureLogicalReads(label: string, sqlText: string): Promise<{
  logicalReads: number | null;
  messages: string[];
}> {
  const pool = getPool();
  const messages: string[] = [];
  const req = pool.request();
  (req as unknown as { on?: (ev: string, cb: (info: { message?: string }) => void) => void }).on?.(
    "info",
    (info) => {
      messages.push(String(info.message ?? ""));
    },
  );

  await req.batch(`
SET STATISTICS IO ON;
${sqlText}
SET STATISTICS IO OFF;
`);

  let total = 0;
  let found = false;
  for (const msg of messages) {
    for (const match of msg.matchAll(/logical reads\s+(\d+)/gi)) {
      total += Number(match[1]);
      found = true;
    }
  }
  console.log(
    `IO[${label}] logical_reads=${found ? total : "UNKNOWN"} info_msgs=${messages.length}`,
  );
  for (const msg of messages.slice(0, 8)) {
    console.log(`  msg: ${msg.replace(/\s+/g, " ").trim().slice(0, 240)}`);
  }
  return { logicalReads: found ? total : null, messages };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const present = await getPool().request().query(`
      SELECT i.name, i.filter_definition, i.type_desc
      FROM sys.indexes i
      WHERE i.object_id = OBJECT_ID(N'dbo.whatsapp_messages')
        AND i.name = N'IX_wm_outbound_sent_at'
    `);
    console.log("INDEX_PRESENT", present.recordset.length > 0, present.recordset[0] ?? null);

    const counts = await getPool().request().query(`
      SELECT
        COUNT_BIG(*) AS total_rows,
        SUM(CASE WHEN direction = N'OUTBOUND' THEN 1 ELSE 0 END) AS outbound_rows
      FROM dbo.whatsapp_messages
    `);
    console.log("ROWS", counts.recordset[0]);

    const baseline = await captureLogicalReads(
      "clustered_forced",
      buildSql("dbo.whatsapp_messages m WITH (INDEX(1))"),
    );
    const forced = await captureLogicalReads(
      "ix_wm_outbound_forced",
      buildSql("dbo.whatsapp_messages m WITH (INDEX(IX_wm_outbound_sent_at))"),
    );
    const natural = await captureLogicalReads(
      "optimizer_choice",
      buildSql("dbo.whatsapp_messages m"),
    );

    // Actual plan operators (best-effort via STATISTICS XML text in messages / recordsets)
    for (const [label, fromClause] of [
      ["clustered_forced", "dbo.whatsapp_messages m WITH (INDEX(1))"],
      ["ix_forced", "dbo.whatsapp_messages m WITH (INDEX(IX_wm_outbound_sent_at))"],
      ["optimizer", "dbo.whatsapp_messages m"],
    ] as const) {
      try {
        const planReq = getPool().request();
        const planMsgs: string[] = [];
        (planReq as unknown as { on?: (ev: string, cb: (info: { message?: string }) => void) => void }).on?.(
          "info",
          (info) => planMsgs.push(String(info.message ?? "")),
        );
        const result = await planReq.batch(`
SET STATISTICS XML ON;
${buildSql(fromClause)}
SET STATISTICS XML OFF;
`);
        const xmlParts: string[] = [];
        const recordsets = Array.isArray(result.recordsets)
          ? result.recordsets
          : result.recordsets
            ? Object.values(result.recordsets)
            : [];
        for (const rs of recordsets) {
          for (const row of rs as Array<Record<string, unknown>>) {
            for (const value of Object.values(row)) {
              if (typeof value === "string" && value.includes("<ShowPlanXML")) {
                xmlParts.push(value);
              }
            }
          }
        }
        const xml = xmlParts.join("\n");
        const indexes = [...xml.matchAll(/Index="\[([^\]]+)\]"/g)].map((m) => m[1]);
        const physical = [...xml.matchAll(/PhysicalOp="([^"]+)"/g)].map((m) => m[1]);
        const estimatedRows = [...xml.matchAll(/EstimateRows="([^"]+)"/g)].slice(0, 5).map((m) => m[1]);
        console.log(
          `PLAN[${label}] indexes=${JSON.stringify([...new Set(indexes)])} ops=${JSON.stringify(
            [...new Set(physical)].slice(0, 12),
          )} est_rows_sample=${JSON.stringify(estimatedRows)}`,
        );
        if (!xml) {
          console.log(`PLAN[${label}] no_xml info=${planMsgs.length}`);
        }
      } catch (error) {
        console.log(
          `PLAN[${label}] err=${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const decision = {
      baselineLogicalReads: baseline.logicalReads,
      indexForcedLogicalReads: forced.logicalReads,
      optimizerLogicalReads: natural.logicalReads,
      note: "ORDER BY COALESCE(sent_at, created_at) may still sort; KEEP only if material filtering/coverage IO benefit",
    };
    console.log("DECISION_INPUT", JSON.stringify(decision));

    if (
      baseline.logicalReads != null &&
      forced.logicalReads != null &&
      forced.logicalReads < baseline.logicalReads * 0.7
    ) {
      console.log("RECOMMENDATION KEEP — material logical-read reduction vs clustered");
    } else if (baseline.logicalReads != null && forced.logicalReads != null) {
      console.log(
        "RECOMMENDATION DROP_CANDIDATE — no material logical-read benefit vs clustered under this workload",
      );
    } else {
      console.log("RECOMMENDATION INCONCLUSIVE — STATISTICS IO messages unavailable; use PLAN lines");
    }
  } finally {
    await closeDatabase();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
