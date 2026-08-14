import { config } from "dotenv";
import { closeDatabase, connectDatabase } from "../database/connection";
import { assertSeedEnvironmentSafe, parseHistoricalSeedCliArgs } from "./historical-seed/cli-args";
import { cleanupHistoricalSeed } from "./historical-seed/cleanup";
import {
  assertBatchNotExists,
  executeHistoricalSeed,
  loadSeedCatalog,
} from "./historical-seed/execute";
import { isCycleIntegrationName } from "./historical-seed/markers";
import { planHistoricalSeed } from "./historical-seed/planner";

config();

const log = (...args: unknown[]): void => {
  console.info("[synthetic_seed]", ...args);
};

const printPlanSummary = (input: {
  companyName: string;
  eligible: number;
  excluded: number;
  services: number;
  batchId: string;
  seed: number;
  estimates: ReturnType<typeof planHistoricalSeed>["estimates"];
  clusters: ReturnType<typeof planHistoricalSeed>["clusters"];
  employeesById: Map<string, string>;
  servicesById: Map<string, string>;
  strongPairs: ReturnType<typeof planHistoricalSeed>["expectedStrongPairs"];
}): void => {
  log(`Company: ${input.companyName}`);
  log(`Seed batch: ${input.batchId} (seed=${input.seed})`);
  log(`Eligible employees: ${input.eligible}`);
  log(`Excluded Cycle integration: ${input.excluded}`);
  log(`Services: ${input.services}`);
  log("Planned:");
  log(`  operations: ${input.estimates.operations}`);
  log(`  workdays: ${input.estimates.workdays}`);
  log(`  individual assignments: ${input.estimates.individualAssignments}`);
  log(`  team assignments: ${input.estimates.teamAssignments}`);
  log(`  employee workdays: ${input.estimates.employeeWorkdays}`);
  log(`  attendance: ${input.estimates.attendanceRecords}`);
  log(`  synthetic work teams: ${input.estimates.workTeams}`);

  for (const cluster of input.clusters) {
    const names = cluster.employeeIds
      .map((id) => input.employeesById.get(id) ?? id)
      .join(", ");
    const favs = cluster.favoriteServiceIds
      .map((id) => input.servicesById.get(id) ?? id)
      .join(", ");
    log(`Cluster ${cluster.index + 1}`);
    log(`  Employees: ${names}`);
    log(`  Favorite services: ${favs}`);
  }

  log("Expected strong affinities (top):");
  for (const pair of input.strongPairs.slice(0, 8)) {
    const left = input.employeesById.get(pair.leftId) ?? pair.leftId;
    const right = input.employeesById.get(pair.rightId) ?? pair.rightId;
    log(`  ${left} ↔ ${right}  sharedOps≈${pair.sharedOps}`);
  }
};

async function main(): Promise<void> {
  assertSeedEnvironmentSafe();
  const options = parseHistoricalSeedCliArgs();

  if (!options.companyId) {
    throw new Error("Missing required --company-id <uuid>");
  }

  await connectDatabase();

  try {
    if (options.cleanup) {
      const preview = await cleanupHistoricalSeed(options.companyId, options.cleanup, {
        dryRun: true,
      });
      log(`Cleanup target batch: ${options.cleanup}`);
      log(`Would delete: ops=${preview.operationsDeleted} workTeams=${preview.workTeamsDeleted}`);
      log(
        `  attendance=${preview.attendanceDeleted} ew=${preview.employeeWorkdaysDeleted} asg=${preview.assignmentsDeleted} wd=${preview.workdaysDeleted}`,
      );
      if (options.dryRun) {
        log("Dry-run only — no deletes.");
        return;
      }
      const result = await cleanupHistoricalSeed(options.companyId, options.cleanup, {
        dryRun: false,
      });
      log("Cleanup completed:", result);
      return;
    }

    const catalog = await loadSeedCatalog(options.companyId);
    if (catalog.services.length === 0) {
      throw new Error("No active services for company — abort.");
    }
    if (catalog.employees.length === 0) {
      throw new Error("All employees excluded or none active — abort.");
    }
    if (catalog.employees.length < 4) {
      throw new Error(
        `Too few eligible employees (${catalog.employees.length}). Need at least 4.`,
      );
    }

    // Safety: ensure exclusion helper matches catalog filter.
    for (const employee of catalog.employees) {
      if (isCycleIntegrationName(employee.name)) {
        throw new Error(`Cycle integration employee leaked into catalog: ${employee.name}`);
      }
    }

    const plan = planHistoricalSeed({
      companyId: options.companyId,
      employees: catalog.employees,
      services: catalog.services,
      operations: options.operations,
      monthsBack: options.monthsBack,
      seed: options.seed,
      batchId: options.batchId,
      timezone: catalog.timezone,
    });

    const employeesById = new Map(catalog.employees.map((e) => [e.id, e.name]));
    const servicesById = new Map(catalog.services.map((s) => [s.id, s.name]));

    printPlanSummary({
      companyName: catalog.companyName,
      eligible: catalog.employees.length,
      excluded: catalog.excludedCycleIntegration,
      services: catalog.services.length,
      batchId: plan.batchId,
      seed: plan.seed,
      estimates: plan.estimates,
      clusters: plan.clusters,
      employeesById,
      servicesById,
      strongPairs: plan.expectedStrongPairs,
    });

    if (options.dryRun) {
      log("Dry-run — no writes. Re-run without --dry-run to execute.");
      return;
    }

    await assertBatchNotExists(options.companyId, plan.batchId);
    log("Executing seed (no WhatsApp / assignment services)…");
    const result = await executeHistoricalSeed(plan, catalog);
    log("Seed completed:", result);
    log(`Batch id for cleanup: ${plan.batchId}`);
  } finally {
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error("[synthetic_seed] FAILED", error);
  process.exitCode = 1;
  void closeDatabase().finally(() => {
    process.exit(1);
  });
});
