import { connectDatabase, closeDatabase } from "../database/connection";
import { runStatisticsGrainAudit } from "./audit-statistics-grain-core";

const parseCompanyId = (): string | undefined => {
  const arg = process.argv.find((value) => value.startsWith("--company-id="));
  if (!arg) {
    return undefined;
  }

  return arg.slice("--company-id=".length) || undefined;
};

const runAudit = async (): Promise<void> => {
  const companyId = parseCompanyId();
  await connectDatabase();
  try {
    const report = await runStatisticsGrainAudit(companyId);
    console.log("[audit:statistics-grain] read-only report");
    console.log(
      JSON.stringify(
        {
          ...report,
          notes: {
            productionAttendance: "is_simulation = 0",
            simulationAttendance: "reported separately as simulationAttendanceLinked",
            autoRepair: false,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await closeDatabase();
  }
};

runAudit()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[audit:statistics-grain] failed", error);
    process.exit(1);
  });
