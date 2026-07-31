import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../src/database/connection";
import { oneTimeScheduleConsistencyInspector } from "../src/services/one-time-schedule-consistency.inspector";
import { oneTimeScheduleRepairService } from "../src/services/one-time-operation-schedule-reconciliation.service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RepairOneTimeScheduleCliArgs = {
  companyId?: string;
  operationIds: string[];
  apply: boolean;
};

export type RepairOneTimeScheduleSummary = {
  scanned: number;
  consistent: number;
  repairable: number;
  repaired: number;
  blocked: number;
  failed: number;
  skipped: number;
};

/**
 * Exit codes:
 * - 0: completed without technical failures
 * - 1: at least one operation failed technically
 * - 2: apply mode encountered blocked operations (no technical failures)
 */
export const resolveRepairCliExitCode = (
  summary: RepairOneTimeScheduleSummary,
  apply: boolean,
): number => {
  if (summary.failed > 0) {
    return 1;
  }
  if (apply && summary.blocked > 0) {
    return 2;
  }
  return 0;
};

export const parseRepairOneTimeScheduleCliArgs = (
  argv: string[],
): RepairOneTimeScheduleCliArgs => {
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

export const listOneTimeOperationScope = async (
  args: RepairOneTimeScheduleCliArgs,
): Promise<Array<{ companyId: string; operationId: string }>> => {
  const pool = getPool();

  if (args.operationIds.length > 0) {
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
      ORDER BY company_id, id
    `);
    return result.recordset.map((row) => ({
      companyId: String(row.company_id),
      operationId: String(row.operation_id),
    }));
  }

  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, args.companyId!)
    .query(`
      SELECT company_id, id AS operation_id
      FROM scheduled_operations
      WHERE company_id = @companyId
        AND operation_kind = N'ONE_TIME'
        AND status NOT IN (N'CANCELLED')
      ORDER BY id
    `);

  return result.recordset.map((row) => ({
    companyId: String(row.company_id),
    operationId: String(row.operation_id),
  }));
};

export const runRepairOneTimeScheduleDrift = async (
  args: RepairOneTimeScheduleCliArgs,
  log: (message: string) => void = console.log,
): Promise<{ summary: RepairOneTimeScheduleSummary; exitCode: number }> => {
  log(
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

  const summary: RepairOneTimeScheduleSummary = {
    scanned: 0,
    consistent: 0,
    repairable: 0,
    repaired: 0,
    blocked: 0,
    failed: 0,
    skipped: 0,
  };

  const candidates = await listOneTimeOperationScope(args);
  summary.scanned = candidates.length;
  log(`\nCandidates: ${candidates.length}`);

  for (const candidate of candidates) {
    try {
      if (args.apply) {
        const outcome = await oneTimeScheduleRepairService.repairFromCurrentSchedule(
          candidate.companyId,
          candidate.operationId,
          { apply: true },
        );
        log(
          JSON.stringify(
            {
              companyId: candidate.companyId,
              operationId: candidate.operationId,
              status: outcome.status,
              dryRun: outcome.dryRun,
              reasonCodes: outcome.report.reasonCodes,
              blockedReason: outcome.report.blockedReason,
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
          if (outcome.result) {
            summary.repaired += 1;
          }
        }
      } else {
        const report = await oneTimeScheduleConsistencyInspector.inspect(
          candidate.companyId,
          candidate.operationId,
        );
        if (report.status === "consistent") {
          summary.consistent += 1;
          continue;
        }
        log(
          JSON.stringify(
            {
              companyId: candidate.companyId,
              operationId: candidate.operationId,
              status: report.status,
              dryRun: true,
              reasonCodes: report.reasonCodes,
              blockedReason: report.blockedReason,
              expected: report.expected,
              currentWorkdays: report.current.workdays,
              assignmentDrift: report.current.assignments
                .filter((row) => !row.cancelledAt)
                .filter(
                  (row) =>
                    !report.expected ||
                    row.validFrom !== report.expected.workDate ||
                    row.validUntil !== report.expected.workDate,
                ),
            },
            null,
            2,
          ),
        );
        if (report.status === "blocked" || report.status === "not_one_time") {
          summary.blocked += 1;
        } else if (report.status === "missing_operation") {
          summary.skipped += 1;
        } else if (report.status === "repairable") {
          summary.repairable += 1;
        }
      }
    } catch (error) {
      summary.failed += 1;
      log(
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

  log("\n=== SUMMARY ===");
  log(JSON.stringify(summary, null, 2));
  const exitCode = resolveRepairCliExitCode(summary, args.apply);
  log(`exitCode=${exitCode}`);
  return { summary, exitCode };
};

async function main(): Promise<void> {
  const args = parseRepairOneTimeScheduleCliArgs(process.argv.slice(2));
  await connectDatabase();
  try {
    const { exitCode } = await runRepairOneTimeScheduleDrift(args);
    process.exitCode = exitCode;
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
