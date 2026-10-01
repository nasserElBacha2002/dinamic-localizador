#!/usr/bin/env tsx
/**
 * Staging IO comparison for IX_wm_outbound_sent_at with temporary seeded rows.
 * All inserts happen inside a transaction that is rolled back.
 */
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import sql from "mssql";
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

type IoResult = { total: number | null; tableReads: number };

async function captureTx(
  tx: sql.Transaction,
  label: string,
  fromClause: string,
): Promise<IoResult> {
  const req = new sql.Request(tx);
  const messages: string[] = [];
  (req as unknown as { on?: (ev: string, cb: (info: { message?: string }) => void) => void }).on?.(
    "info",
    (info) => messages.push(String(info.message ?? "")),
  );
  await req.batch(`SET STATISTICS IO ON;\n${buildSql(fromClause)}\nSET STATISTICS IO OFF;`);
  let total = 0;
  let found = false;
  let tableReads = 0;
  for (const msg of messages) {
    for (const match of msg.matchAll(/logical reads\s+(\d+)/gi)) {
      total += Number(match[1]);
      found = true;
    }
    const wm = /Table 'whatsapp_messages'\. Scan count (\d+), logical reads (\d+)/i.exec(msg);
    if (wm) {
      tableReads = Number(wm[2]);
    }
  }
  console.log(`IO[${label}] total_logical=${found ? total : "?"} wm_logical=${tableReads}`);
  for (const msg of messages) {
    if (/whatsapp_messages|Worktable|cost_ledger/i.test(msg)) {
      console.log(" ", msg.replace(/\s+/g, " ").trim().slice(0, 240));
    }
  }
  return { total: found ? total : null, tableReads };
}

async function planTx(tx: sql.Transaction, label: string, fromClause: string): Promise<void> {
  const req = new sql.Request(tx);
  const result = await req.batch(
    `SET STATISTICS XML ON;\n${buildSql(fromClause)}\nSET STATISTICS XML OFF;`,
  );
  let xml = "";
  const recordsets = Array.isArray(result.recordsets)
    ? result.recordsets
    : result.recordsets
      ? Object.values(result.recordsets)
      : [];
  for (const rs of recordsets) {
    for (const row of rs as Array<Record<string, unknown>>) {
      for (const value of Object.values(row)) {
        if (typeof value === "string" && value.includes("<ShowPlanXML")) {
          xml += value;
        }
      }
    }
  }
  const indexes = [...new Set([...xml.matchAll(/Index="\[([^\]]+)\]"/g)].map((m) => m[1]))];
  const physical = [...new Set([...xml.matchAll(/PhysicalOp="([^"]+)"/g)].map((m) => m[1]))];
  console.log(
    `PLAN[${label}] indexes=${JSON.stringify(indexes)} hasSort=${physical.includes("Sort")} ops=${JSON.stringify(physical.slice(0, 15))}`,
  );
}

async function main(): Promise<void> {
  await connectDatabase();
  const pool = getPool();
  const company = await pool.request().query(`SELECT TOP 1 id FROM dbo.companies`);
  const companyId = company.recordset[0]?.id as string | undefined;
  if (!companyId) {
    throw new Error("no company available for seed probe");
  }

  const present = await pool.request().query(`
    SELECT i.name FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.whatsapp_messages')
      AND i.name = N'IX_wm_outbound_sent_at'
  `);
  console.log("INDEX_PRESENT", present.recordset.length > 0);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const batchSize = 500;
    for (let b = 0; b < 10; b += 1) {
      const values: string[] = [];
      for (let i = 0; i < batchSize; i += 1) {
        const n = b * batchSize + i;
        const id = randomUUID();
        const sid = `SMIO${String(n).padStart(8, "0")}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
        const dir = n % 5 === 0 ? "INBOUND" : "OUTBOUND";
        const sent = n % 7 === 0 ? "NULL" : `DATEADD(MINUTE, -${n}, SYSUTCDATETIME())`;
        values.push(
          `('${id}','${companyId}','${sid}','${sid}',N'${dir}',N'+5491100000000',N'+5491199999999',N'TEXT',N'sent',DATEADD(MINUTE,-${n},SYSUTCDATETIME()),${sent},DATEADD(MINUTE,-${n},SYSUTCDATETIME()))`,
        );
      }
      await new sql.Request(tx).batch(`
        INSERT INTO dbo.whatsapp_messages (
          id, company_id, message_sid, provider_message_sid, direction,
          phone_from, phone_to, message_type, status, created_at, sent_at, updated_at
        )
        VALUES ${values.join(",\n")};
      `);
    }

    await new sql.Request(tx).batch(`
      INSERT INTO dbo.whatsapp_message_cost_ledger (
        id, company_id, provider_message_sid, direction, sent_at, recipient_phone_masked,
        message_kind, cost_quality, cost_source, created_at, updated_at, next_sync_at
      )
      SELECT TOP (400)
        NEWID(), m.company_id, m.provider_message_sid, m.direction, COALESCE(m.sent_at, m.created_at),
        N'+54911******00', N'TEXT', N'PENDING', N'NONE', SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
      FROM dbo.whatsapp_messages m
      WHERE m.direction = N'OUTBOUND' AND m.provider_message_sid LIKE N'SMIO%'
      ORDER BY m.created_at;
    `);

    const counts = await new sql.Request(tx).query(`
      SELECT
        SUM(CASE WHEN message_sid LIKE N'SMIO%' THEN 1 ELSE 0 END) AS seeded,
        SUM(CASE WHEN message_sid LIKE N'SMIO%' AND direction = N'OUTBOUND' THEN 1 ELSE 0 END) AS seeded_out
      FROM dbo.whatsapp_messages
    `);
    console.log("SEEDED", counts.recordset[0]);

    try {
      await new sql.Request(tx).batch(`UPDATE STATISTICS dbo.whatsapp_messages WITH FULLSCAN;`);
      console.log("STATS updated");
    } catch (error) {
      console.log("STATS skip", error instanceof Error ? error.message : String(error));
    }

    const base = await captureTx(tx, "clustered_forced", "dbo.whatsapp_messages m WITH (INDEX(1))");
    const ix = await captureTx(
      tx,
      "ix_forced",
      "dbo.whatsapp_messages m WITH (INDEX(IX_wm_outbound_sent_at))",
    );
    const nat = await captureTx(tx, "optimizer", "dbo.whatsapp_messages m");
    await planTx(tx, "clustered_forced", "dbo.whatsapp_messages m WITH (INDEX(1))");
    await planTx(tx, "ix_forced", "dbo.whatsapp_messages m WITH (INDEX(IX_wm_outbound_sent_at))");
    await planTx(tx, "optimizer", "dbo.whatsapp_messages m");

    console.log("DECISION_INPUT", JSON.stringify({ base, ix, nat }));
    if (base.tableReads > 0 && ix.tableReads > 0 && ix.tableReads < base.tableReads * 0.7) {
      console.log("RECOMMENDATION KEEP — material wm logical-read reduction");
    } else {
      console.log(
        "RECOMMENDATION DROP — no material wm logical-read benefit (Sort still expected with COALESCE)",
      );
    }
  } finally {
    await tx.rollback();
    console.log("ROLLED_BACK");
    await closeDatabase();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
