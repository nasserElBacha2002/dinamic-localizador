#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "dotenv";
import { buildReportCsv } from "../utils/store-fix/csv";
import { loadCurrentStoresFromDatabase } from "../utils/store-fix/db-stores";

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
  let outPath = "./data/database_stores.csv";

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
  npm run export:stores -- [--out ./data/database_stores.csv]

Exports the connected database stores table to CSV for reconcile:stores.
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
  const { stores } = await loadCurrentStoresFromDatabase();

  const rows = stores.map((store) => [
    store.id,
    store.name,
    store.address,
    store.latitude === null ? "" : String(store.latitude),
    store.longitude === null ? "" : String(store.longitude),
    store.allowedRadiusMeters === null ? "" : String(store.allowedRadiusMeters),
    store.active ? "1" : "0",
    store.createdAt,
    store.updatedAt,
    store.googlePlaceId ?? "",
    store.neighborhood ?? "",
    store.locality ?? "",
    store.storeFormat ?? "",
  ]);

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, buildReportCsv(HEADERS, rows), "utf8");

  console.log(`Exported ${stores.length} store(s) to ${absolutePath}`);
};

void main().catch((error) => {
  console.error("Store export failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
