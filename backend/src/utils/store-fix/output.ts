import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildReportCsv } from "./csv";
import { buildProposedSqlScript } from "./sql";
import type { FixPlan, ProposedFix } from "./types";

const PROPOSED_HEADERS = [
  "store_number",
  "db_id",
  "fix_type",
  "old_address",
  "new_address",
  "old_latitude",
  "old_longitude",
  "new_latitude",
  "new_longitude",
  "distance_meters",
  "confidence",
  "apply_by_default",
  "reason",
] as const;

const SKIPPED_HEADERS = ["store_number", "db_id", "skipped_reason", "details"] as const;

const DUPLICATE_HEADERS = [
  "store_number",
  "db_id",
  "address",
  "latitude",
  "longitude",
  "coordinate_distance_meters",
  "address_match_status",
  "recommendation",
  "reason",
] as const;

const MISSING_HEADERS = [
  "store_number",
  "official_address",
  "neighborhood",
  "locality",
  "latitude",
  "longitude",
  "can_insert",
  "reason",
] as const;

const writeFile = (outDir: string, fileName: string, content: string): void => {
  writeFileSync(join(outDir, fileName), content, "utf8");
  console.log(`Wrote ${join(outDir, fileName)}`);
};

export const writeFixPlanOutputs = (outDir: string, plan: FixPlan, sqlFixes: ProposedFix[]): void => {
  mkdirSync(outDir, { recursive: true });

  const missingMeta = new Map(
    plan.missingInserts.map((row) => [
      row.storeNumber,
      { neighborhood: row.neighborhood, locality: row.locality },
    ]),
  );

  writeFile(
    outDir,
    "proposed_store_fixes.csv",
    buildReportCsv(
      PROPOSED_HEADERS,
      plan.proposed.map((fix) => [
        fix.storeNumber,
        fix.dbId,
        fix.fixType,
        fix.oldAddress,
        fix.newAddress,
        fix.oldLatitude,
        fix.oldLongitude,
        fix.newLatitude,
        fix.newLongitude,
        fix.distanceMeters === null ? "" : String(Math.round(fix.distanceMeters * 100) / 100),
        fix.confidence,
        String(fix.applyByDefault),
        fix.reason,
      ]),
    ),
  );

  writeFile(
    outDir,
    "skipped_store_fixes.csv",
    buildReportCsv(
      SKIPPED_HEADERS,
      plan.skipped.map((row) => [row.storeNumber, row.dbId, row.skippedReason, row.details]),
    ),
  );

  writeFile(
    outDir,
    "duplicate_resolution_plan.csv",
    buildReportCsv(
      DUPLICATE_HEADERS,
      plan.duplicateResolution.map((row) => [
        row.storeNumber,
        row.dbId,
        row.address,
        row.latitude,
        row.longitude,
        row.coordinateDistanceMeters,
        row.addressMatchStatus,
        row.recommendation,
        row.reason,
      ]),
    ),
  );

  writeFile(
    outDir,
    "missing_store_insert_plan.csv",
    buildReportCsv(
      MISSING_HEADERS,
      plan.missingInserts.map((row) => [
        row.storeNumber,
        row.officialAddress,
        row.neighborhood,
        row.locality,
        row.latitude,
        row.longitude,
        String(row.canInsert),
        row.reason,
      ]),
    ),
  );

  if (plan.missingRequiresCoordinates.length > 0) {
    writeFile(
      outDir,
      "missing_requires_coordinates.csv",
      buildReportCsv(
        MISSING_HEADERS,
        plan.missingRequiresCoordinates.map((row) => [
          row.storeNumber,
          row.officialAddress,
          row.neighborhood,
          row.locality,
          row.latitude,
          row.longitude,
          String(row.canInsert),
          row.reason,
        ]),
      ),
    );
  }

  writeFile(outDir, "fix_summary.json", `${JSON.stringify(plan.summary, null, 2)}\n`);
  writeFile(
    outDir,
    "environment_snapshot.json",
    `${JSON.stringify(plan.environmentSnapshot, null, 2)}\n`,
  );

  const environmentLabel = `${plan.environmentSnapshot.nodeEnv}@${plan.environmentSnapshot.dbName}`;
  writeFile(
    outDir,
    "proposed_store_updates.sql",
    buildProposedSqlScript(sqlFixes, missingMeta, environmentLabel),
  );
};
