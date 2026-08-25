#!/usr/bin/env node
/**
 * READ-ONLY audit of location_zones geographic quality.
 *
 * Usage:
 *   npm run location-zones:audit
 *   npm run location-zones:audit -- --company-id <uuid>
 *   npm run location-zones:audit -- --json
 *   npm run location-zones:audit -- --help
 */
import { config } from "dotenv";
import sql from "mssql";
import { closeDatabase, connectDatabase, getPool } from "../database/connection";
import { resolveCanonicalLocality } from "../utils/geocoding/canonical-locality";
import {
  parseLocationZonesAuditCliArgs,
  printLocationZonesAuditUsage,
} from "./audit-location-zones-cli";

config();

const LOG_PREFIX = "[location-zones:audit]";

type ZoneRow = {
  id: string;
  company_id: string;
  name: string;
  normalized_name: string;
  locality: string | null;
  normalized_locality: string;
  geocoding_status: string | null;
  geocoding_source: string | null;
  centroid_latitude: number | null;
  centroid_longitude: number | null;
  is_active: boolean;
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printLocationZonesAuditUsage();
    return;
  }

  const options = parseLocationZonesAuditCliArgs(argv);
  await connectDatabase();

  const request = getPool().request();
  let where = "1=1";
  if (options.companyId) {
    request.input("companyId", sql.UniqueIdentifier, options.companyId);
    where = "company_id = @companyId";
  }

  const result = await request.query(`
    SELECT
      id,
      company_id,
      name,
      normalized_name,
      locality,
      normalized_locality,
      geocoding_status,
      geocoding_source,
      centroid_latitude,
      centroid_longitude,
      is_active
    FROM location_zones
    WHERE ${where}
  `);

  const rows = result.recordset as ZoneRow[];
  const localityBuckets = new Map<
    string,
    { count: number; companies: Set<string>; canonical: string; status: string }
  >();

  let canonicalized = 0;
  let unknownLocality = 0;
  let missingLocality = 0;
  let failedGeocoding = 0;
  let manual = 0;
  const possibleDuplicates: Array<{
    name: string;
    normalizedName: string;
    leftLocality: string | null;
    rightLocality: string | null;
    leftCode: string | null;
    rightCode: string | null;
  }> = [];

  /** company_id + normalized_name + canonical code → zones (possible semantic duplicates). */
  const byNormalizedCanonical = new Map<string, ZoneRow[]>();

  for (const row of rows) {
    const resolved = resolveCanonicalLocality(row.locality);
    const localityKey = resolved.displayLocality ?? "(empty)";
    const bucket = localityBuckets.get(localityKey) ?? {
      count: 0,
      companies: new Set<string>(),
      canonical: resolved.code ?? "UNKNOWN",
      status: resolved.status,
    };
    bucket.count += 1;
    bucket.companies.add(String(row.company_id));
    localityBuckets.set(localityKey, bucket);

    if (!resolved.displayLocality) {
      missingLocality += 1;
    } else if (resolved.status === "RESOLVED") {
      canonicalized += 1;
    } else {
      unknownLocality += 1;
    }

    if (row.geocoding_status === "FAILED") {
      failedGeocoding += 1;
    }
    if (row.geocoding_status === "MANUAL" || row.geocoding_source === "MANUAL") {
      manual += 1;
    }

    if (resolved.status === "RESOLVED" && resolved.code) {
      const key = `${row.company_id}::${row.normalized_name}::${resolved.code}`;
      const list = byNormalizedCanonical.get(key) ?? [];
      list.push(row);
      byNormalizedCanonical.set(key, list);
    }
  }

  for (const [, group] of byNormalizedCanonical) {
    if (group.length < 2) {
      continue;
    }
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const left = group[i]!;
        const right = group[j]!;
        const leftCanon = resolveCanonicalLocality(left.locality);
        const rightCanon = resolveCanonicalLocality(right.locality);
        possibleDuplicates.push({
          name: left.name,
          normalizedName: left.normalized_name,
          leftLocality: left.locality,
          rightLocality: right.locality,
          leftCode: leftCanon.code,
          rightCode: rightCanon.code,
        });
      }
    }
  }

  const summary = {
    totalZones: rows.length,
    canonicalized,
    unknownLocality,
    missingLocality,
    failedGeocoding,
    manual,
    possibleDuplicatePairs: possibleDuplicates.length,
    localities: [...localityBuckets.entries()]
      .map(([locality, data]) => ({
        locality,
        count: data.count,
        companiesAffected: data.companies.size,
        canonical: data.canonical,
        status: data.status,
      }))
      .sort((a, b) => b.count - a.count),
    possibleDuplicates: possibleDuplicates.slice(0, 50),
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.info(`${LOG_PREFIX} summary`, {
      totalZones: summary.totalZones,
      canonicalized: summary.canonicalized,
      unknownLocality: summary.unknownLocality,
      missingLocality: summary.missingLocality,
      failedGeocoding: summary.failedGeocoding,
      manual: summary.manual,
      possibleDuplicatePairs: summary.possibleDuplicatePairs,
    });
    console.info(`${LOG_PREFIX} localities`);
    for (const row of summary.localities) {
      console.info(
        `  ${row.locality}: count=${row.count} companies=${row.companiesAffected} canonical=${row.canonical} status=${row.status}`,
      );
    }
    if (summary.possibleDuplicates.length > 0) {
      console.info(
        `${LOG_PREFIX} possible duplicates (same normalized_name + same canonical code)`,
      );
      for (const dup of summary.possibleDuplicates) {
        console.info(
          `  ${dup.normalizedName}: "${dup.leftLocality}" (${dup.leftCode}) vs "${dup.rightLocality}" (${dup.rightCode})`,
        );
      }
    }
  }

  await closeDatabase();
}

main().catch(async (error) => {
  console.error(LOG_PREFIX, error instanceof Error ? error.message : error);
  try {
    await closeDatabase();
  } catch {
    // ignore
  }
  process.exit(1);
});
