import sql from "mssql";
import { connectDatabase, closeDatabase } from "../../database/connection";
import { buildSqlForFix } from "./sql";
import type { ProposedFix } from "./types";

const formatDecimal = (value: string): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  return parsed;
};

const applyCoordinateFix = async (
  transaction: sql.Transaction,
  fix: ProposedFix,
): Promise<number> => {
  const result = await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, fix.dbId)
    .input("storeNumber", sql.NVarChar(150), fix.storeNumber)
    .input("latitude", sql.Decimal(10, 7), formatDecimal(fix.newLatitude))
    .input("longitude", sql.Decimal(10, 7), formatDecimal(fix.newLongitude))
    .query(`
      UPDATE operational_locations
      SET latitude = @latitude,
          longitude = @longitude,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id
        AND name = @storeNumber
    `);

  return result.rowsAffected[0] ?? 0;
};

const applyAddressFix = async (transaction: sql.Transaction, fix: ProposedFix): Promise<number> => {
  const result = await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, fix.dbId)
    .input("storeNumber", sql.NVarChar(150), fix.storeNumber)
    .input("address", sql.NVarChar(300), fix.newAddress)
    .query(`
      UPDATE operational_locations
      SET address = @address,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id
        AND name = @storeNumber
    `);

  return result.rowsAffected[0] ?? 0;
};

const applyRenameFix = async (transaction: sql.Transaction, fix: ProposedFix): Promise<number> => {
  const result = await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, fix.dbId)
    .input("name", sql.NVarChar(150), fix.storeNumber)
    .query(`
      UPDATE operational_locations
      SET name = @name,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id
    `);

  return result.rowsAffected[0] ?? 0;
};

const applyDeactivateFix = async (transaction: sql.Transaction, fix: ProposedFix): Promise<number> => {
  const result = await new sql.Request(transaction)
    .input("id", sql.UniqueIdentifier, fix.dbId)
    .input("storeNumber", sql.NVarChar(150), fix.storeNumber)
    .query(`
      UPDATE operational_locations
      SET active = 0,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id
        AND name = @storeNumber
    `);

  return result.rowsAffected[0] ?? 0;
};

const applyInsertFix = async (
  transaction: sql.Transaction,
  fix: ProposedFix,
  neighborhood: string,
  locality: string,
): Promise<number> => {
  const result = await new sql.Request(transaction)
    .input("name", sql.NVarChar(150), fix.storeNumber)
    .input("address", sql.NVarChar(300), fix.newAddress)
    .input("neighborhood", sql.NVarChar(150), neighborhood || null)
    .input("locality", sql.NVarChar(150), locality || null)
    .input("latitude", sql.Decimal(10, 7), formatDecimal(fix.newLatitude))
    .input("longitude", sql.Decimal(10, 7), formatDecimal(fix.newLongitude))
    .query(`
      INSERT INTO operational_locations (
        name, address, neighborhood, locality, latitude, longitude,
        allowed_radius_meters, active, google_place_id, created_at, updated_at
      )
      VALUES (
        @name, @address, @neighborhood, @locality, @latitude, @longitude,
        150, 1, NULL, SYSUTCDATETIME(), SYSUTCDATETIME()
      )
    `);

  return result.rowsAffected[0] ?? 0;
};

export const applyFixes = async (
  fixes: ProposedFix[],
  missingMeta: Map<string, { neighborhood: string; locality: string }>,
): Promise<{ applied: number; details: string[] }> => {
  const pool = await connectDatabase();
  const transaction = new sql.Transaction(pool);
  const details: string[] = [];

  await transaction.begin();

  try {
    let applied = 0;

    for (const fix of fixes) {
      let affected = 0;

      switch (fix.fixType) {
        case "AUTO_FIX_COORDINATE":
        case "CRITICAL_COORDINATE_FIX":
        case "REVIEW_COORDINATE_FIX":
          affected = await applyCoordinateFix(transaction, fix);
          break;
        case "AUTO_FIX_ADDRESS":
          affected = await applyAddressFix(transaction, fix);
          break;
        case "RENAME_NONNUMERIC":
          affected = await applyRenameFix(transaction, fix);
          break;
        case "DEACTIVATE_DUPLICATE":
        case "DEACTIVATE_EXTRA":
          affected = await applyDeactivateFix(transaction, fix);
          break;
        case "INSERT_MISSING": {
          const meta = missingMeta.get(fix.storeNumber) ?? { neighborhood: "", locality: "" };
          affected = await applyInsertFix(transaction, fix, meta.neighborhood, meta.locality);
          break;
        }
        default:
          throw new Error(`Unsupported fix type for apply: ${fix.fixType}`);
      }

      if (affected !== 1) {
        throw new Error(
          `Expected to affect exactly 1 row for ${fix.fixType} on store ${fix.storeNumber} (${fix.dbId}), got ${affected}. SQL: ${buildSqlForFix(fix)}`,
        );
      }

      applied += 1;
      details.push(`${fix.fixType} applied for store ${fix.storeNumber} (${fix.dbId})`);
    }

    await transaction.commit();
    return { applied, details };
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await closeDatabase();
  }
};

export const verifyAppliedFixes = async (
  fixes: ProposedFix[],
): Promise<Array<{ dbId: string; verified: boolean; details: string }>> => {
  const pool = await connectDatabase();
  const results: Array<{ dbId: string; verified: boolean; details: string }> = [];

  try {
    for (const fix of fixes) {
      if (!fix.dbId) {
        continue;
      }

      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, fix.dbId)
        .input("storeNumber", sql.NVarChar(150), fix.storeNumber)
        .query(`
          SELECT name, address, latitude, longitude, active
          FROM operational_locations
          WHERE id = @id
            AND name = @storeNumber
        `);

      const row = result.recordset[0];
      if (!row) {
        results.push({ dbId: fix.dbId, verified: false, details: "Row not found after apply" });
        continue;
      }

      let verified = true;
      const details: string[] = [];

      if (
        ["AUTO_FIX_COORDINATE", "CRITICAL_COORDINATE_FIX", "REVIEW_COORDINATE_FIX"].includes(
          fix.fixType,
        )
      ) {
        const latitude = Number(row.latitude);
        const longitude = Number(row.longitude);
        const expectedLat = formatDecimal(fix.newLatitude);
        const expectedLng = formatDecimal(fix.newLongitude);
        const latTolerance = 0.0000001;
        verified =
          Math.abs(latitude - expectedLat) <= latTolerance &&
          Math.abs(longitude - expectedLng) <= latTolerance;
        details.push(`latitude=${latitude}, longitude=${longitude}`);
      }

      if (fix.fixType === "AUTO_FIX_ADDRESS") {
        verified = String(row.address) === fix.newAddress;
        details.push(`address=${row.address}`);
      }

      if (fix.fixType === "RENAME_NONNUMERIC") {
        verified = String(row.name) === fix.storeNumber;
        details.push(`name=${row.name}`);
      }

      if (fix.fixType === "DEACTIVATE_DUPLICATE" || fix.fixType === "DEACTIVATE_EXTRA") {
        verified = row.active === false || row.active === 0;
        details.push(`active=${row.active}`);
      }

      results.push({
        dbId: fix.dbId,
        verified,
        details: details.join("; "),
      });
    }
  } finally {
    await closeDatabase();
  }

  return results;
};
