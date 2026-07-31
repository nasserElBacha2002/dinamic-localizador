import { connectDatabase, closeDatabase } from "../src/database/connection";
import { oneTimeOperationScheduleReconciliationService } from "../src/services/one-time-operation-schedule-reconciliation.service";
import { getPool } from "../src/database/connection";
import sql from "mssql";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CliArgs = {
  companyId?: string;
  operationIds: string[];
  apply: boolean;
};

const parseArgs = (argv: string[]): CliArgs => {
  const args = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--apply") {
      args.set("apply", true);
      continue;
    }
    if (token === "--dry-run") {
      args.set("apply", false);
      continue;
    }
    if (token.startsWith("--") && argv[index + 1]) {
      args.set(token.slice(2), argv[index + 1]!);
      index += 1;
    }
  }

  const companyId = args.get("companyId");
  const operationIdsRaw = args.get("operationIds");
  const operationIds =
    typeof operationIdsRaw === "string"
      ? operationIdsRaw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

  if (typeof companyId === "string" && !UUID_PATTERN.test(companyId)) {
    throw new Error("--companyId must be a UUID");
  }
  for (const operationId of operationIds) {
    if (!UUID_PATTERN.test(operationId)) {
      throw new Error(`Invalid operation UUID: ${operationId}`);
    }
  }
  if (!companyId && operationIds.length === 0) {
    throw new Error(
      "Scope required: pass --companyId <uuid> and/or --operationIds <uuid,uuid>",
    );
  }

  return {
    companyId: typeof companyId === "string" ? companyId : undefined,
    operationIds,
    apply: args.get("apply") === true,
  };
};

const listCandidateOperationIds = async (args: CliArgs): Promise<
  Array<{ companyId: string; operationId: string }>
> => {
  if (args.operationIds.length > 0) {
    const pool = getPool();
    const request = pool.request();
    const placeholders = args.operationIds.map((_, index) => {
      const key = `operationId${index}`;
      request.input(key, sql.UniqueIdentifier, args.operationIds[index]);
      return `@${key}`;
    });
    if (args.companyId) {
      request.input("companyId", sql.UniqueIdentifier, args.companyId);
    }
    const result = await request.query(`
      SELECT company_id, id AS operation_id
      FROM scheduled_operations
      WHERE operation_kind = N'ONE_TIME'
        AND id IN (${placeholders.join(", ")})
        ${args.companyId ? "AND company_id = @companyId" : ""}
    `);
    return result.recordset.map((row) => ({
      companyId: String(row.company_id),
      operationId: String(row.operation_id),
    }));
  }

  const pool = getPool();
  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, args.companyId!)
    .query(`
      SELECT so.company_id, so.id AS operation_id
      FROM scheduled_operations so
      LEFT JOIN operation_workdays ow
        ON ow.operation_id = so.id
       AND ow.company_id = so.company_id
      LEFT JOIN operation_assignments oa
        ON oa.operation_id = so.id
       AND oa.company_id = so.company_id
       AND oa.cancelled_at IS NULL
      WHERE so.company_id = @companyId
        AND so.operation_kind = N'ONE_TIME'
        AND so.status NOT IN (N'CANCELLED')
        AND (
          ow.id IS NULL
          OR ow.expected_start_at <> so.scheduled_start
          OR (
            (ow.expected_end_at IS NULL AND so.scheduled_end IS NOT NULL)
            OR (ow.expected_end_at IS NOT NULL AND so.scheduled_end IS NULL)
            OR ow.expected_end_at <> so.scheduled_end
          )
          OR (
            oa.id IS NOT NULL
            AND (
              oa.valid_from <> CAST(ow.work_date AS DATE)
              OR oa.valid_until IS NULL
              OR oa.valid_until <> CAST(ow.work_date AS DATE)
            )
          )
        )
      GROUP BY so.company_id, so.id
      ORDER BY so.id
    `);

  return result.recordset.map((row) => ({
    companyId: String(row.company_id),
    operationId: String(row.operation_id),
  }));
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "APPLY" : "DRY_RUN",
        companyId: args.companyId ?? null,
        operationIds: args.operationIds,
      },
      null,
      2,
    ),
  );

  await connectDatabase();

  const summary = {
    scanned: 0,
    consistent: 0,
    repairable: 0,
    repaired: 0,
    blocked: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    const candidates = await listCandidateOperationIds(args);
    summary.scanned = candidates.length;
    console.log(`\nCandidates: ${candidates.length}`);

    for (const candidate of candidates) {
      try {
        const outcome =
          await oneTimeOperationScheduleReconciliationService.repairFromCurrentSchedule(
            candidate.companyId,
            candidate.operationId,
            { apply: args.apply },
          );

        console.log(
          JSON.stringify(
            {
              companyId: candidate.companyId,
              operationId: candidate.operationId,
              status: outcome.status,
              dryRun: outcome.dryRun,
              detail: outcome.detail,
              result: outcome.result ?? null,
            },
            null,
            2,
          ),
        );

        if (outcome.status === "consistent") {
          summary.consistent += 1;
        } else if (outcome.status === "blocked" || outcome.status === "not_one_time") {
          summary.blocked += 1;
        } else if (outcome.status === "missing_operation") {
          summary.skipped += 1;
        } else if (outcome.status === "repairable") {
          summary.repairable += 1;
          if (args.apply && outcome.result) {
            summary.repaired += 1;
          }
        }
      } catch (error) {
        summary.failed += 1;
        console.error(
          JSON.stringify(
            {
              companyId: candidate.companyId,
              operationId: candidate.operationId,
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        );
      }
    }

    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
