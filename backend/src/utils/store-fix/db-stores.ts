import sql from "mssql";
import { connectDatabase, closeDatabase } from "../../database/connection";
import { env } from "../../config/env";
import type { CurrentDbStore, EnvironmentSnapshot, StoresSchema } from "./types";

const TABLE_NAME = "operational_locations";

const pickColumn = (
  availableColumns: Set<string>,
  candidates: readonly string[],
): string | null => {
  for (const candidate of candidates) {
    if (availableColumns.has(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const detectStoresSchema = async (pool: sql.ConnectionPool): Promise<StoresSchema> => {
  const result = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${TABLE_NAME}'
  `);

  const availableColumns = new Set<string>(
    result.recordset.map((row: { COLUMN_NAME: string }) => row.COLUMN_NAME.toLowerCase()),
  );

  const neighborhoodColumn = pickColumn(availableColumns, ["neighborhood", "barrio"]);
  const localityColumn = pickColumn(availableColumns, ["locality", "localidad"]);
  const storeFormatColumn = pickColumn(availableColumns, ["store_format", "formato", "format"]);

  if (!availableColumns.has("id") || !availableColumns.has("name") || !availableColumns.has("address")) {
    throw new Error("operational_locations table is missing required columns: id, name, address");
  }

  return {
    tableName: TABLE_NAME,
    neighborhoodColumn,
    localityColumn,
    storeFormatColumn,
    availableColumns,
  };
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === "1";

const buildSelectQuery = (schema: StoresSchema): string => {
  const optionalColumns = [
    schema.neighborhoodColumn,
    schema.localityColumn,
    schema.storeFormatColumn,
  ].filter((column): column is string => column !== null);

  const selectList = [
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
    ...optionalColumns,
  ];

  return `
    SELECT ${selectList.join(", ")}
    FROM ${schema.tableName}
  `;
};

export const loadCurrentStoresFromDatabase = async (): Promise<{
  stores: CurrentDbStore[];
  schema: StoresSchema;
}> => {
  const pool = await connectDatabase();

  try {
    const schema = await detectStoresSchema(pool);
    const result = await pool.request().query(buildSelectQuery(schema));

    const stores = result.recordset.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name ?? "").trim(),
      address: String(row.address ?? "").trim(),
      latitude: toNullableNumber(row.latitude),
      longitude: toNullableNumber(row.longitude),
      allowedRadiusMeters: toNullableNumber(row.allowed_radius_meters),
      active: toBoolean(row.active),
      createdAt: row.created_at ? String(row.created_at) : "",
      updatedAt: row.updated_at ? String(row.updated_at) : "",
      googlePlaceId: toNullableString(row.google_place_id),
      neighborhood: schema.neighborhoodColumn
        ? toNullableString(row[schema.neighborhoodColumn])
        : null,
      locality: schema.localityColumn ? toNullableString(row[schema.localityColumn]) : null,
      storeFormat: schema.storeFormatColumn
        ? toNullableString(row[schema.storeFormatColumn])
        : null,
    }));

    return { stores, schema };
  } finally {
    await closeDatabase();
  }
};

export const buildEnvironmentSnapshot = (
  stores: CurrentDbStore[],
  duplicateNumericGroups: number,
): EnvironmentSnapshot => ({
  nodeEnv: env.NODE_ENV,
  dbHost: env.DB_HOST,
  dbPort: env.DB_PORT,
  dbName: env.DB_NAME,
  dbUser: env.DB_USER,
  tableName: TABLE_NAME,
  totalCurrentDbRows: stores.length,
  totalNumericCurrentDbStores: stores.filter((store) => /^\d+$/.test(store.name)).length,
  totalNonNumericCurrentDbRows: stores.filter((store) => !/^\d+$/.test(store.name)).length,
  duplicateNumericStoreGroups: duplicateNumericGroups,
  generatedAt: new Date().toISOString(),
});

export const printStartupSummary = (input: {
  mode: "dry-run" | "apply";
  snapshot: EnvironmentSnapshot;
}): void => {
  console.log("");
  console.log("Store fix script — environment");
  console.log(`- NODE_ENV: ${input.snapshot.nodeEnv}`);
  console.log(`- DB_HOST: ${input.snapshot.dbHost}`);
  console.log(`- DB_PORT: ${input.snapshot.dbPort}`);
  console.log(`- DB_NAME: ${input.snapshot.dbName}`);
  console.log(`- DB_USER: ${input.snapshot.dbUser}`);
  console.log(`- target table: ${input.snapshot.tableName}`);
  console.log(`- mode: ${input.mode}`);
  console.log(`- current DB rows: ${input.snapshot.totalCurrentDbRows}`);
  console.log(`- numeric stores: ${input.snapshot.totalNumericCurrentDbStores}`);
  console.log(`- non-numeric stores: ${input.snapshot.totalNonNumericCurrentDbRows}`);
  console.log(`- duplicate numeric groups: ${input.snapshot.duplicateNumericStoreGroups}`);
  console.log("");
};
