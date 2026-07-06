#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { buildReportCsv } from "../utils/service-fix/csv";
import { loadCurrentServicesFromDatabase } from "../utils/service-fix/db-services";

config();

const HEADERS = [
  "id",
  "name",
  "address",
  "latitude",
  "longitude",
  "allowed_radius_meters",
  "active",
  "created_at",
  "updated_at",
  "google_place_id",
  "neighborhood",
  "locality",
  "store_format",
] as const;

const parseCliOptions = (argv: string[]): { outPath: string } => {
  let outPath = "./data/database_services.csv";

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--out") {
      if (!next) {
        throw new Error("Missing value for --out");
      }
      outPath = next;
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npm run export:services -- [--out ./data/database_services.csv]
  npm run export:stores -- [--out ./data/database_services.csv]

Exports the connected database services table to CSV for reconcile:services.
`);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { outPath };
};

const main = async (): Promise<void> => {
  const { outPath } = parseCliOptions(process.argv);
  const absolutePath = resolve(outPath);
  const { services } = await loadCurrentServicesFromDatabase();

  const rows = services.map((service) => [
    service.id,
    service.name,
    service.address,
    service.latitude === null ? "" : String(service.latitude),
    service.longitude === null ? "" : String(service.longitude),
    service.allowedRadiusMeters === null ? "" : String(service.allowedRadiusMeters),
    service.active ? "1" : "0",
    service.createdAt,
    service.updatedAt,
    service.googlePlaceId ?? "",
    service.neighborhood ?? "",
    service.locality ?? "",
    service.serviceFormat ?? "",
  ]);

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, buildReportCsv(HEADERS, rows), "utf8");

  console.log(`Exported ${services.length} service(s) to ${absolutePath}`);
};

void main().catch((error) => {
  console.error("Service export failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
