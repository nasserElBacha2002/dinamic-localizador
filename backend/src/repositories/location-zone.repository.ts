import sql from "mssql";
import { getPool } from "../database/connection";
import type { UpdateLocationZoneInput } from "../schemas/location-zone.schema";
import type { LocationZone } from "../types/location-zone";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapLocationZoneRow = (row: Record<string, unknown>): LocationZone => ({
  id: String(row.id),
  companyId: String(row.company_id),
  name: String(row.name),
  normalizedName: String(row.normalized_name),
  locality: row.locality ? String(row.locality) : null,
  normalizedLocality: String(row.normalized_locality ?? ""),
  centroidLatitude: toNullableNumber(row.centroid_latitude),
  centroidLongitude: toNullableNumber(row.centroid_longitude),
  isActive: Boolean(row.is_active),
  assignedEmployeesCount:
    row.assigned_employees_count !== undefined && row.assigned_employees_count !== null
      ? Number(row.assigned_employees_count)
      : undefined,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const locationZoneRepository = {
  async listForCompany(
    companyId: string,
    options: { includeInactive: boolean },
  ): Promise<LocationZone[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT
          lz.*,
          COALESCE(counts.assigned_employees_count, 0) AS assigned_employees_count
        FROM location_zones lz
        LEFT JOIN (
          SELECT location_zone_id, COUNT(*) AS assigned_employees_count
          FROM employees
          WHERE company_id = @companyId
            AND location_zone_id IS NOT NULL
          GROUP BY location_zone_id
        ) counts ON counts.location_zone_id = lz.id
        WHERE lz.company_id = @companyId
          ${options.includeInactive ? "" : "AND lz.is_active = 1"}
        ORDER BY lz.name ASC, lz.locality ASC
      `);

    return result.recordset.map((row) => mapLocationZoneRow(row as Record<string, unknown>));
  },

  async findByIdForCompany(companyId: string, zoneId: string): Promise<LocationZone | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .query(`
        SELECT
          lz.*,
          COALESCE(counts.assigned_employees_count, 0) AS assigned_employees_count
        FROM location_zones lz
        LEFT JOIN (
          SELECT location_zone_id, COUNT(*) AS assigned_employees_count
          FROM employees
          WHERE company_id = @companyId
            AND location_zone_id = @zoneId
          GROUP BY location_zone_id
        ) counts ON counts.location_zone_id = lz.id
        WHERE lz.id = @zoneId
          AND lz.company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>);
  },

  async findAssignableById(companyId: string, zoneId: string): Promise<LocationZone | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .query(`
        SELECT TOP 1 *
        FROM location_zones
        WHERE id = @zoneId
          AND company_id = @companyId
          AND is_active = 1
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByNormalizedKey(
    companyId: string,
    normalizedName: string,
    normalizedLocality: string,
  ): Promise<LocationZone | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(120), normalizedName)
      .input("normalizedLocality", sql.NVarChar(120), normalizedLocality)
      .query(`
        SELECT TOP 1 *
        FROM location_zones
        WHERE company_id = @companyId
          AND normalized_name = @normalizedName
          AND normalized_locality = @normalizedLocality
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(
    companyId: string,
    input: {
      name: string;
      normalizedName: string;
      locality: string | null;
      normalizedLocality: string;
      centroidLatitude: number | null;
      centroidLongitude: number | null;
    },
  ): Promise<LocationZone> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(120), input.name)
      .input("normalizedName", sql.NVarChar(120), input.normalizedName)
      .input("locality", sql.NVarChar(120), input.locality)
      .input("normalizedLocality", sql.NVarChar(120), input.normalizedLocality)
      .input("centroidLatitude", sql.Decimal(10, 7), input.centroidLatitude)
      .input("centroidLongitude", sql.Decimal(10, 7), input.centroidLongitude)
      .query(`
        INSERT INTO location_zones (
          company_id,
          name,
          normalized_name,
          locality,
          normalized_locality,
          centroid_latitude,
          centroid_longitude,
          is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId,
          @name,
          @normalizedName,
          @locality,
          @normalizedLocality,
          @centroidLatitude,
          @centroidLongitude,
          1
        )
      `);

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>);
  },

  async update(
    companyId: string,
    zoneId: string,
    input: UpdateLocationZoneInput & {
      name?: string;
      normalizedName?: string;
      locality?: string | null;
      normalizedLocality?: string;
    },
  ): Promise<LocationZone | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId);

    if (input.name !== undefined && input.normalizedName !== undefined) {
      request.input("name", sql.NVarChar(120), input.name);
      request.input("normalizedName", sql.NVarChar(120), input.normalizedName);
      fields.push("name = @name", "normalized_name = @normalizedName");
    }

    if (input.locality !== undefined && input.normalizedLocality !== undefined) {
      request.input("locality", sql.NVarChar(120), input.locality);
      request.input("normalizedLocality", sql.NVarChar(120), input.normalizedLocality);
      fields.push("locality = @locality", "normalized_locality = @normalizedLocality");
    }

    if (input.centroidLatitude !== undefined && input.centroidLongitude !== undefined) {
      request.input("centroidLatitude", sql.Decimal(10, 7), input.centroidLatitude);
      request.input("centroidLongitude", sql.Decimal(10, 7), input.centroidLongitude);
      fields.push(
        "centroid_latitude = @centroidLatitude",
        "centroid_longitude = @centroidLongitude",
      );
    }

    if (input.isActive !== undefined) {
      request.input("isActive", sql.Bit, input.isActive);
      fields.push("is_active = @isActive");
    }

    if (fields.length === 0) {
      return this.findByIdForCompany(companyId, zoneId);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE location_zones
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @zoneId
        AND company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>);
  },
};
