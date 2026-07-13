import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../src/database/connection";
import {
  buildOperationalLocationDuplicateAuditQuery,
  buildOperationalLocationDuplicateRemediationUpdate,
} from "../src/database/operational-location-duplicate-remediation";
import {
  exitWithError,
  parseOperationalLocationDuplicateCliArgs,
  printOperationalLocationDuplicateUsage,
} from "./operational-location-duplicate-cli";
import { printOperationalEnvironment } from "./operation-reassignment-cli";

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printOperationalLocationDuplicateUsage();
    return;
  }

  const args = parseOperationalLocationDuplicateCliArgs(process.argv.slice(2));
  printOperationalEnvironment();
  console.log(`Modo: ${args.apply ? "APPLY" : "PREVIEW"}`);

  await connectDatabase();
  const pool = getPool();

  try {
    const auditRequest = pool.request();
    if (args.companyId) {
      auditRequest.input("companyId", sql.UniqueIdentifier, args.companyId);
    }

    const auditQuery = buildOperationalLocationDuplicateAuditQuery(args.companyId);
    const before = await auditRequest.query(auditQuery);
    const duplicateRows = before.recordset.length;
    if (duplicateRows === 0) {
      console.log("No hay duplicados para reparar.");
      return;
    }

    console.log(`Filas en grupos duplicados: ${duplicateRows}`);
    if (!args.apply) {
      console.log("Ejecutá con --apply para renombrar duplicados.");
      return;
    }

    const remediationRequest = pool.request();
    if (args.companyId) {
      remediationRequest.input("companyId", sql.UniqueIdentifier, args.companyId);
    }

    const remediation = await remediationRequest.query(
      buildOperationalLocationDuplicateRemediationUpdate(args.companyId),
    );
    console.log(`Ubicaciones renombradas: ${remediation.recordset.length}`);
    for (const row of remediation.recordset as Array<Record<string, unknown>>) {
      console.log(
        JSON.stringify(
          {
            id: row.id,
            companyId: row.company_id,
            previousName: row.previous_name,
            newName: row.new_name,
          },
          null,
          2,
        ),
      );
    }

    const after = await auditRequest.query(auditQuery);
    if (after.recordset.length > 0) {
      throw new Error(
        `Quedaron ${after.recordset.length} filas en grupos duplicados después de la reparación.`,
      );
    }

    console.log("Reparación completada sin duplicados restantes.");
  } finally {
    await closeDatabase();
  }
}

void main().catch(exitWithError);
