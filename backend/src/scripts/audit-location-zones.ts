#!/usr/bin/env node
/**
 * READ-ONLY audit of the global location_zones catalog.
 * Optional --company-id filters to zones associated via company_location_zones.
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
  name: string;
  normalized_name: string;
  locality: string | null;
  normalized_locality: string;
  geocoding_status: string | null;
  geocoding_source: string | null;
  centroid_latitude: number | null;
  centroid_longitude: number | null;
  is_active: boolean;
  associated_companies: number;
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
    where = `EXISTS (
      SELECT 1 FROM company_location_zones clz
      WHERE clz.location_zone_id = lz.id
        AND clz.company_id = @companyId
    )`;
  }

  const result = await request.query(`
    SELECT
      lz.id,
      lz.name,
      lz.normalized_name,
      lz.locality,
      lz.normalized_locality,
      lz.geocoding_status,
      lz.geocoding_source,
      lz.centroid_latitude,
      lz.centroid_longitude,
      lz.is_active,
      (
        SELECT COUNT(*)
        FROM company_location_zones clz
        WHERE clz.location_zone_id = lz.id
      ) AS associated_companies
    FROM location_zones lz
    WHERE ${where}
  `);

  const rows = result.recordset as ZoneRow[];
  const localityBuckets = new Map<
    string,
    { count: number; associatedCompanies: number; canonical: string; status: string }
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

  /** normalized_name + canonical locality code → zones (possible semantic duplicates). */
  const byNormalizedCanonical = new Map<string, ZoneRow[]>();

  for (const row of rows) {
    const resolved = resolveCanonicalLocality(row.locality);
    const localityKey = resolved.displayLocality ?? "(empty)";
    const bucket = localityBuckets.get(localityKey) ?? {
      count: 0,
      associatedCompanies: 0,
      canonical: resolved.code ?? "UNKNOWN",
      status: resolved.status,
    };
    bucket.count += 1;
    bucket.associatedCompanies += Number(row.associated_companies ?? 0);
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
      const key = `${row.normalized_name}::${resolved.code}`;
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
        associationLinks: data.associatedCompanies,
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
    for (const row of summary.localities.slice(0, 20)) {
      console.info(
        `${LOG_PREFIX} locality=${row.locality} count=${row.count} associations=${row.associationLinks} canonical=${row.canonical}`,
      );
    }
    if (summary.possibleDuplicates.length > 0) {
      console.info(`${LOG_PREFIX} possibleDuplicates (sample)`, summary.possibleDuplicates);
    }
  }

  await closeDatabase();
}

main().catch(async (error) => {
  console.error(LOG_PREFIX, error);
  try {
    await closeDatabase();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
