import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../src/database/connection";
import { buildOperationalLocationDuplicateAuditQuery } from "../src/database/operational-location-duplicate-remediation";
import {
  exitWithError,
  parseOperationalLocationDuplicateCliArgs,
  printOperationalLocationDuplicateUsage,
} from "./operational-location-duplicate-cli";
import { printOperationalEnvironment } from "./operation-reassignment-cli";

interface DuplicateAuditRow {
  company_id: string;
  company_name: string;
  normalized_name: string;
  id: string;
  current_name: string;
  active: boolean;
  created_at: Date;
  operation_count: number;
  duplicate_rank: number;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printOperationalLocationDuplicateUsage();
    return;
  }

  const args = parseOperationalLocationDuplicateCliArgs(process.argv.slice(2));
  printOperationalEnvironment();

  await connectDatabase();
  const pool = getPool();

  try {
    const request = pool.request();
    if (args.companyId) {
      request.input("companyId", sql.UniqueIdentifier, args.companyId);
    }

    const auditQuery = buildOperationalLocationDuplicateAuditQuery(args.companyId);
    const result = await request.query(auditQuery);
    const rows = result.recordset as DuplicateAuditRow[];

    if (rows.length === 0) {
      console.log("No hay nombres de ubicación operativa duplicados por empresa.");
      return;
    }

    const groups = new Map<string, DuplicateAuditRow[]>();
    for (const row of rows) {
      const key = `${row.company_id}::${row.normalized_name}`;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }

    console.log(`\nGrupos duplicados encontrados: ${groups.size}`);
    for (const [key, group] of groups) {
      const [companyId, normalizedName] = key.split("::");
      console.log(`\n=== ${group[0]?.company_name ?? companyId} / "${normalizedName}" ===`);
      for (const row of group) {
        const action =
          row.duplicate_rank === 1
            ? "KEEP"
            : `RENAME -> "${row.normalized_name} (${row.duplicate_rank})"`;
        console.log(
          JSON.stringify(
            {
              id: row.id,
              currentName: row.current_name,
              duplicateRank: row.duplicate_rank,
              operationCount: row.operation_count,
              active: row.active,
              action,
            },
            null,
            2,
          ),
        );
      }
    }
  } finally {
    await closeDatabase();
  }
}

void main().catch(exitWithError);
