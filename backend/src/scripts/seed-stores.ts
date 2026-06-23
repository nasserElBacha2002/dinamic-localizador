import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import sql from "mssql";
import { connectDatabase, closeDatabase } from "../database/connection";

config();

interface StoreRow {
  codigo: string;
  direccion: string;
  localidad: string;
  provincia: string;
  latitude: number;
  longitude: number;
}

const SEED_FILE = join(process.cwd(), "..", "database", "seeds", "stores_production.tsv");

function parseLatitude(value: string): number | null {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAddress(direccion: string, localidad: string, provincia: string): string {
  const parts = [direccion, localidad, provincia].map((part) => part.trim()).filter(Boolean);
  return parts.join(", ");
}

function parseSeedFile(content: string): StoreRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [header, ...rows] = lines;
  if (!header?.toLowerCase().includes("codigo")) {
    throw new Error("Invalid seed file: missing header row.");
  }

  const stores: StoreRow[] = [];

  for (const line of rows) {
    const columns = line.split("\t");
    if (columns.length < 8) {
      continue;
    }

    const codigo = columns[1]?.trim();
    const latitude = parseLatitude(columns.at(-4) ?? "");
    const longitude = parseLatitude(columns.at(-3) ?? "");

    let direccion = "";
    let localidad = "";
    let provincia = "";

    if (columns.length >= 10) {
      provincia = columns.at(-6)?.trim() ?? "";
      localidad = columns.at(-7)?.trim() ?? "";
      direccion = columns.slice(2, -7).join(" ").trim();
    } else {
      direccion = columns[2]?.trim() ?? "";
      localidad = columns[3]?.trim() ?? "";
      provincia = columns[4]?.trim() ?? "";
    }

    if (!codigo || latitude === null || longitude === null) {
      continue;
    }

    stores.push({
      codigo,
      direccion,
      localidad,
      provincia,
      latitude,
      longitude,
    });
  }

  return stores;
}

async function upsertStore(pool: sql.ConnectionPool, store: StoreRow): Promise<"inserted" | "updated"> {
  const name = store.codigo.slice(0, 150);
  const address = buildAddress(store.direccion, store.localidad, store.provincia).slice(0, 300) || null;
  const localidad = store.localidad.slice(0, 150) || null;

  const result = await pool
    .request()
    .input("name", sql.NVarChar(150), name)
    .input("address", sql.NVarChar(300), address)
    .input("localidad", sql.NVarChar(150), localidad)
    .input("latitude", sql.Decimal(10, 7), store.latitude)
    .input("longitude", sql.Decimal(10, 7), store.longitude)
    .query(`
      MERGE stores AS target
      USING (
        SELECT
          @name AS name,
          @address AS address,
          @localidad AS localidad,
          @latitude AS latitude,
          @longitude AS longitude
      ) AS source
      ON target.name = source.name
      WHEN MATCHED THEN
        UPDATE SET
          address = source.address,
          localidad = source.localidad,
          latitude = source.latitude,
          longitude = source.longitude,
          active = 1,
          updated_at = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (name, address, localidad, latitude, longitude, allowed_radius_meters, active)
        VALUES (source.name, source.address, source.localidad, source.latitude, source.longitude, 150, 1)
      OUTPUT $action AS action;
    `);

  const action = String(result.recordset[0]?.action ?? "");
  return action === "UPDATE" ? "updated" : "inserted";
}

const main = async (): Promise<void> => {
  const content = readFileSync(SEED_FILE, "utf8");
  const stores = parseSeedFile(content);

  if (stores.length === 0) {
    throw new Error(`No stores parsed from ${SEED_FILE}`);
  }

  const pool = await connectDatabase();
  let inserted = 0;
  let updated = 0;

  try {
    for (const store of stores) {
      const action = await upsertStore(pool, store);
      if (action === "inserted") {
        inserted += 1;
      } else {
        updated += 1;
      }
    }
  } finally {
    await closeDatabase();
  }

  console.log(`Stores seed completed: ${inserted} inserted, ${updated} updated (${stores.length} total).`);
};

void main().catch((error) => {
  console.error("Failed to seed stores:", error);
  process.exit(1);
});
