import sql from "mssql";
import { getPool } from "../database/connection";
import type { UpdateLocationZoneInput } from "../schemas/location-zone.schema";
import type {
  CompanyLocationZoneView,
  GlobalLocationZone,
  LocationZone,
  LocationZoneGeocodingSource,
  LocationZoneGeocodingStatus,
} from "../types/location-zone";
import {
  buildGeocodingCoverageSummary,
  summarizeCanonicalLocalities,
} from "../utils/location-zone-geocoding-summary";
import {
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIsoString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return toIsoString(value as Date | string);
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toGeocodingStatus = (value: unknown): LocationZoneGeocodingStatus | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const status = String(value);
  if (
    status === "PENDING" ||
    status === "RESOLVED" ||
    status === "FAILED" ||
    status === "MANUAL"
  ) {
    return status;
  }
  return null;
};

const toGeocodingSource = (value: unknown): LocationZoneGeocodingSource | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const source = String(value);
  if (source === "AUTO" || source === "MANUAL") {
    return source;
  }
  return null;
};

const mapGlobalLocationZoneFields = (row: Record<string, unknown>): GlobalLocationZone => {
  const zoneActive = Boolean(row.is_active);
  return {
    id: String(row.id),
    name: String(row.name),
    normalizedName: String(row.normalized_name),
    locality: row.locality ? String(row.locality) : null,
    normalizedLocality: String(row.normalized_locality ?? ""),
    centroidLatitude: toNullableNumber(row.centroid_latitude),
    centroidLongitude: toNullableNumber(row.centroid_longitude),
    geocodingStatus: toGeocodingStatus(row.geocoding_status),
    geocodingSource: toGeocodingSource(row.geocoding_source),
    geocodedAt: toNullableIsoString(row.geocoded_at),
    geocodingLastError: row.geocoding_last_error ? String(row.geocoding_last_error) : null,
    /** Always the global catalog flag */
    isActive: zoneActive,
    createdAt: toIsoString(row.created_at as Date | string),
    updatedAt: toIsoString(row.updated_at as Date | string),
  };
};

export const mapLocationZoneRow = (
  row: Record<string, unknown>,
  companyContextId: string | null = null,
): LocationZone => {
  const global = mapGlobalLocationZoneFields(row);
  const hasAssociationContext =
    companyContextId !== null ||
    (row.association_id !== undefined && row.association_id !== null) ||
    (row.association_is_active !== undefined && row.association_is_active !== null);

  if (!hasAssociationContext) {
    return global;
  }

  const companyId =
    companyContextId ??
    (row.company_id !== undefined && row.company_id !== null ? String(row.company_id) : "");
  const associationActive =
    row.association_is_active === undefined || row.association_is_active === null
      ? false
      : Boolean(row.association_is_active);

  const view: CompanyLocationZoneView = {
    ...global,
    companyId,
    associationId:
      row.association_id !== undefined && row.association_id !== null
        ? String(row.association_id)
        : "",
    associationActive,
    globalIsActive: global.isActive,
    alreadyAssociated:
      row.already_associated !== undefined && row.already_associated !== null
        ? Boolean(row.already_associated)
        : undefined,
    assignedEmployeesCount:
      row.assigned_employees_count !== undefined && row.assigned_employees_count !== null
        ? Number(row.assigned_employees_count)
        : undefined,
  };
  return view;
};

export type LocationZoneCreateInput = {
  name: string;
  normalizedName: string;
  locality: string | null;
  normalizedLocality: string;
  centroidLatitude: number | null;
  centroidLongitude: number | null;
  geocodingStatus?: LocationZoneGeocodingStatus | null;
  geocodingSource?: LocationZoneGeocodingSource | null;
  geocodedAt?: Date | null;
  geocodingLastError?: string | null;
};

export type LocationZoneGeocodingWrite = {
  centroidLatitude: number | null;
  centroidLongitude: number | null;
  geocodingStatus: LocationZoneGeocodingStatus;
  geocodingSource: LocationZoneGeocodingSource;
  geocodedAt: Date | null;
  geocodingLastError: string | null;
};

export type CompanyLocationZoneAssociation = {
  id: string;
  companyId: string;
  locationZoneId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const mapAssociationRow = (row: Record<string, unknown>): CompanyLocationZoneAssociation => ({
  id: String(row.id),
  companyId: String(row.company_id),
  locationZoneId: String(row.location_zone_id),
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const locationZoneRepository = {
  async listForCompany(
    companyId: string,
    options: { includeInactive: boolean },
  ): Promise<CompanyLocationZoneView[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT
          lz.*,
          clz.id AS association_id,
          clz.is_active AS association_is_active,
          COALESCE(counts.assigned_employees_count, 0) AS assigned_employees_count
        FROM company_location_zones clz
        INNER JOIN location_zones lz ON lz.id = clz.location_zone_id
        LEFT JOIN (
          SELECT location_zone_id, COUNT(*) AS assigned_employees_count
          FROM employees
          WHERE company_id = @companyId
            AND location_zone_id IS NOT NULL
          GROUP BY location_zone_id
        ) counts ON counts.location_zone_id = lz.id
        WHERE clz.company_id = @companyId
          ${options.includeInactive ? "" : "AND clz.is_active = 1 AND lz.is_active = 1"}
        ORDER BY lz.name ASC, lz.locality ASC
      `);

    return result.recordset.map((row) =>
      mapLocationZoneRow(row as Record<string, unknown>, companyId),
    ) as CompanyLocationZoneView[];
  },

  async searchGlobal(
    companyId: string,
    query: { q: string; locality?: string | null; limit: number },
  ): Promise<CompanyLocationZoneView[]> {
    const pool = getPool();
    const normalizedQ = normalizeLocationZoneName(query.q);
    const localityFilter =
      query.locality !== undefined && query.locality !== null && query.locality.trim() !== ""
        ? normalizeLocationZoneLocality(query.locality)
        : null;

    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("q", sql.NVarChar(120), normalizedQ)
      .input("limit", sql.Int, query.limit);

    const localityClause = localityFilter
      ? "AND lz.normalized_locality = @normalizedLocality"
      : "";
    if (localityFilter) {
      request.input("normalizedLocality", sql.NVarChar(120), localityFilter);
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        lz.*,
        clz.id AS association_id,
        clz.is_active AS association_is_active,
        CASE WHEN clz.id IS NULL THEN 0 ELSE 1 END AS already_associated
      FROM location_zones lz
      LEFT JOIN company_location_zones clz
        ON clz.location_zone_id = lz.id
       AND clz.company_id = @companyId
      WHERE lz.is_active = 1
        AND (
          lz.normalized_name LIKE @q + N'%'
          OR lz.name LIKE @q + N'%'
          OR lz.normalized_locality LIKE @q + N'%'
        )
        ${localityClause}
      ORDER BY
        CASE WHEN clz.id IS NULL THEN 0 ELSE 1 END ASC,
        lz.name ASC,
        lz.locality ASC
    `);

    return result.recordset.map((row) =>
      mapLocationZoneRow(row as Record<string, unknown>, companyId),
    ) as CompanyLocationZoneView[];
  },

  async findById(zoneId: string): Promise<GlobalLocationZone | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .query(`
        SELECT TOP 1 *
        FROM location_zones
        WHERE id = @zoneId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>, null);
  },

  async findByIdForCompany(
    companyId: string,
    zoneId: string,
  ): Promise<CompanyLocationZoneView | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .query(`
        SELECT
          lz.*,
          clz.id AS association_id,
          clz.is_active AS association_is_active,
          COALESCE(counts.assigned_employees_count, 0) AS assigned_employees_count
        FROM company_location_zones clz
        INNER JOIN location_zones lz ON lz.id = clz.location_zone_id
        LEFT JOIN (
          SELECT location_zone_id, COUNT(*) AS assigned_employees_count
          FROM employees
          WHERE company_id = @companyId
            AND location_zone_id = @zoneId
          GROUP BY location_zone_id
        ) counts ON counts.location_zone_id = lz.id
        WHERE clz.company_id = @companyId
          AND lz.id = @zoneId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(
      result.recordset[0] as Record<string, unknown>,
      companyId,
    ) as CompanyLocationZoneView;
  },

  async findAssignableById(
    companyId: string,
    zoneId: string,
  ): Promise<CompanyLocationZoneView | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .query(`
        SELECT TOP 1
          lz.*,
          clz.id AS association_id,
          clz.is_active AS association_is_active
        FROM company_location_zones clz
        INNER JOIN location_zones lz ON lz.id = clz.location_zone_id
        WHERE clz.company_id = @companyId
          AND lz.id = @zoneId
          AND clz.is_active = 1
          AND lz.is_active = 1
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(
      result.recordset[0] as Record<string, unknown>,
      companyId,
    ) as CompanyLocationZoneView;
  },

  async findByNormalizedKey(
    normalizedName: string,
    normalizedLocality: string,
  ): Promise<GlobalLocationZone | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("normalizedName", sql.NVarChar(120), normalizedName)
      .input("normalizedLocality", sql.NVarChar(120), normalizedLocality)
      .query(`
        SELECT TOP 1 *
        FROM location_zones
        WHERE normalized_name = @normalizedName
          AND normalized_locality = @normalizedLocality
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>, null);
  },

  async findAssociation(
    companyId: string,
    zoneId: string,
  ): Promise<CompanyLocationZoneAssociation | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .query(`
        SELECT TOP 1 *
        FROM company_location_zones
        WHERE company_id = @companyId
          AND location_zone_id = @zoneId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssociationRow(result.recordset[0] as Record<string, unknown>);
  },

  async createGlobal(input: LocationZoneCreateInput): Promise<GlobalLocationZone> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("name", sql.NVarChar(120), input.name)
      .input("normalizedName", sql.NVarChar(120), input.normalizedName)
      .input("locality", sql.NVarChar(120), input.locality)
      .input("normalizedLocality", sql.NVarChar(120), input.normalizedLocality)
      .input("centroidLatitude", sql.Decimal(10, 7), input.centroidLatitude)
      .input("centroidLongitude", sql.Decimal(10, 7), input.centroidLongitude)
      .input("geocodingStatus", sql.NVarChar(20), input.geocodingStatus ?? null)
      .input("geocodingSource", sql.NVarChar(20), input.geocodingSource ?? null)
      .input("geocodedAt", sql.DateTime2, input.geocodedAt ?? null)
      .input("geocodingLastError", sql.NVarChar(500), input.geocodingLastError ?? null)
      .query(`
        INSERT INTO location_zones (
          name,
          normalized_name,
          locality,
          normalized_locality,
          centroid_latitude,
          centroid_longitude,
          geocoding_status,
          geocoding_source,
          geocoded_at,
          geocoding_last_error,
          is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @name,
          @normalizedName,
          @locality,
          @normalizedLocality,
          @centroidLatitude,
          @centroidLongitude,
          @geocodingStatus,
          @geocodingSource,
          @geocodedAt,
          @geocodingLastError,
          1
        )
      `);

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>, null);
  },

  /**
   * Find or insert a global zone by normalized key, then ensure company association.
   * Runs in a transaction; UNIQUE constraints remain the authority on races.
   */
  async resolveOrCreateGlobalAndAssociate(
    companyId: string,
    input: LocationZoneCreateInput,
    options: { reactivateAssociation?: boolean } = {},
  ): Promise<CompanyLocationZoneView> {
    const reactivateAssociation = options.reactivateAssociation !== false;
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let zoneId: string;
    try {
      const existingResult = await new sql.Request(transaction)
        .input("normalizedName", sql.NVarChar(120), input.normalizedName)
        .input("normalizedLocality", sql.NVarChar(120), input.normalizedLocality)
        .query(`
          SELECT TOP 1 id
          FROM location_zones
          WHERE normalized_name = @normalizedName
            AND normalized_locality = @normalizedLocality
        `);

      if (existingResult.recordset[0]) {
        zoneId = String(existingResult.recordset[0].id);
      } else {
        try {
          const insertResult = await new sql.Request(transaction)
            .input("name", sql.NVarChar(120), input.name)
            .input("normalizedName", sql.NVarChar(120), input.normalizedName)
            .input("locality", sql.NVarChar(120), input.locality)
            .input("normalizedLocality", sql.NVarChar(120), input.normalizedLocality)
            .input("centroidLatitude", sql.Decimal(10, 7), input.centroidLatitude)
            .input("centroidLongitude", sql.Decimal(10, 7), input.centroidLongitude)
            .input("geocodingStatus", sql.NVarChar(20), input.geocodingStatus ?? null)
            .input("geocodingSource", sql.NVarChar(20), input.geocodingSource ?? null)
            .input("geocodedAt", sql.DateTime2, input.geocodedAt ?? null)
            .input("geocodingLastError", sql.NVarChar(500), input.geocodingLastError ?? null)
            .query(`
              INSERT INTO location_zones (
                name,
                normalized_name,
                locality,
                normalized_locality,
                centroid_latitude,
                centroid_longitude,
                geocoding_status,
                geocoding_source,
                geocoded_at,
                geocoding_last_error,
                is_active
              )
              OUTPUT INSERTED.id
              VALUES (
                @name,
                @normalizedName,
                @locality,
                @normalizedLocality,
                @centroidLatitude,
                @centroidLongitude,
                @geocodingStatus,
                @geocodingSource,
                @geocodedAt,
                @geocodingLastError,
                1
              )
            `);
          zoneId = String(insertResult.recordset[0].id);
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
          const raced = await new sql.Request(transaction)
            .input("normalizedName", sql.NVarChar(120), input.normalizedName)
            .input("normalizedLocality", sql.NVarChar(120), input.normalizedLocality)
            .query(`
              SELECT TOP 1 id
              FROM location_zones
              WHERE normalized_name = @normalizedName
                AND normalized_locality = @normalizedLocality
            `);
          if (!raced.recordset[0]) {
            throw error;
          }
          zoneId = String(raced.recordset[0].id);
        }
      }

      const associationResult = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("zoneId", sql.UniqueIdentifier, zoneId)
        .query(`
          SELECT TOP 1 id, is_active
          FROM company_location_zones
          WHERE company_id = @companyId
            AND location_zone_id = @zoneId
        `);

      if (associationResult.recordset[0]) {
        const isActive = Boolean(associationResult.recordset[0].is_active);
        if (!isActive) {
          if (!reactivateAssociation) {
            throw Object.assign(new Error("LOCATION_ZONE_ASSOCIATION_INACTIVE"), {
              code: "LOCATION_ZONE_ASSOCIATION_INACTIVE",
            });
          }
          await new sql.Request(transaction)
            .input("companyId", sql.UniqueIdentifier, companyId)
            .input("zoneId", sql.UniqueIdentifier, zoneId)
            .query(`
              UPDATE company_location_zones
              SET is_active = 1,
                  updated_at = SYSUTCDATETIME()
              WHERE company_id = @companyId
                AND location_zone_id = @zoneId
            `);
        }
      } else {
        try {
          await new sql.Request(transaction)
            .input("companyId", sql.UniqueIdentifier, companyId)
            .input("zoneId", sql.UniqueIdentifier, zoneId)
            .query(`
              INSERT INTO company_location_zones (company_id, location_zone_id, is_active)
              VALUES (@companyId, @zoneId, 1)
            `);
        } catch (error) {
          if (!isDuplicateKeyError(error)) {
            throw error;
          }
          if (reactivateAssociation) {
            await new sql.Request(transaction)
              .input("companyId", sql.UniqueIdentifier, companyId)
              .input("zoneId", sql.UniqueIdentifier, zoneId)
              .query(`
                UPDATE company_location_zones
                SET is_active = 1,
                    updated_at = SYSUTCDATETIME()
                WHERE company_id = @companyId
                  AND location_zone_id = @zoneId
                  AND is_active = 0
              `);
          }
        }
      }

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback errors
      }
      throw error;
    }

    const view = await this.findByIdForCompany(companyId, zoneId);
    if (!view) {
      throw new Error("Failed to load company location zone after resolveOrCreate");
    }
    return view;
  },

  async ensureAssociation(
    companyId: string,
    zoneId: string,
    options: { reactivate?: boolean } = {},
  ): Promise<CompanyLocationZoneAssociation> {
    const reactivate = options.reactivate !== false;
    const existing = await this.findAssociation(companyId, zoneId);
    if (existing) {
      if (existing.isActive) {
        return existing;
      }
      if (!reactivate) {
        return existing;
      }
      const reactivated = await this.setAssociationActive(companyId, zoneId, true);
      if (!reactivated) {
        throw new Error("Failed to reactivate company location zone association");
      }
      return reactivated;
    }

    const pool = getPool();
    try {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("zoneId", sql.UniqueIdentifier, zoneId)
        .query(`
          INSERT INTO company_location_zones (company_id, location_zone_id, is_active)
          OUTPUT INSERTED.*
          VALUES (@companyId, @zoneId, 1)
        `);
      return mapAssociationRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      // Concurrent insert: re-read.
      const raced = await this.findAssociation(companyId, zoneId);
      if (raced) {
        if (!raced.isActive) {
          const reactivated = await this.setAssociationActive(companyId, zoneId, true);
          if (reactivated) {
            return reactivated;
          }
        }
        return raced;
      }
      throw error;
    }
  },

  async setAssociationActive(
    companyId: string,
    zoneId: string,
    isActive: boolean,
  ): Promise<CompanyLocationZoneAssociation | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .input("isActive", sql.Bit, isActive ? 1 : 0)
      .query(`
        UPDATE company_location_zones
        SET is_active = @isActive,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND location_zone_id = @zoneId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssociationRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Zones eligible for automatic geocoding backfill (global catalog).
   */
  async listEligibleForGeocoding(options: {
    companyId?: string;
    includeFailed?: boolean;
  }): Promise<GlobalLocationZone[]> {
    const pool = getPool();
    const includeFailed = options.includeFailed !== false;
    const request = pool.request();

    const companyFilter = options.companyId
      ? `AND EXISTS (
           SELECT 1 FROM company_location_zones clz
           WHERE clz.location_zone_id = location_zones.id
             AND clz.company_id = @companyId
         )`
      : "";
    if (options.companyId) {
      request.input("companyId", sql.UniqueIdentifier, options.companyId);
    }

    const failedClause = includeFailed ? "OR geocoding_status = N'FAILED'" : "";

    const result = await request.query(`
      SELECT *
      FROM location_zones
      WHERE (geocoding_source IS NULL OR geocoding_source <> N'MANUAL')
        AND (geocoding_status IS NULL OR geocoding_status <> N'MANUAL')
        AND (
          centroid_latitude IS NULL
          OR centroid_longitude IS NULL
          OR geocoding_status = N'PENDING'
          ${failedClause}
        )
        ${companyFilter}
      ORDER BY name ASC, locality ASC
    `);

    return result.recordset.map((row) =>
      mapLocationZoneRow(row as Record<string, unknown>, null),
    );
  },

  async updateGlobal(
    zoneId: string,
    input: UpdateLocationZoneInput & {
      name?: string;
      normalizedName?: string;
      locality?: string | null;
      normalizedLocality?: string;
      geocodingStatus?: LocationZoneGeocodingStatus | null;
      geocodingSource?: LocationZoneGeocodingSource | null;
      geocodedAt?: Date | null;
      geocodingLastError?: string | null;
    },
  ): Promise<GlobalLocationZone | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool.request().input("zoneId", sql.UniqueIdentifier, zoneId);

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

    if (input.geocodingStatus !== undefined) {
      request.input("geocodingStatus", sql.NVarChar(20), input.geocodingStatus);
      fields.push("geocoding_status = @geocodingStatus");
    }

    if (input.geocodingSource !== undefined) {
      request.input("geocodingSource", sql.NVarChar(20), input.geocodingSource);
      fields.push("geocoding_source = @geocodingSource");
    }

    if (input.geocodedAt !== undefined) {
      request.input("geocodedAt", sql.DateTime2, input.geocodedAt);
      fields.push("geocoded_at = @geocodedAt");
    }

    if (input.geocodingLastError !== undefined) {
      request.input("geocodingLastError", sql.NVarChar(500), input.geocodingLastError);
      fields.push("geocoding_last_error = @geocodingLastError");
    }

    if (input.isActive !== undefined) {
      request.input("isActive", sql.Bit, input.isActive);
      fields.push("is_active = @isActive");
    }

    if (fields.length === 0) {
      return this.findById(zoneId);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE location_zones
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @zoneId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>, null);
  },

  async applyGeocodeResult(
    zoneId: string,
    write: LocationZoneGeocodingWrite,
    expected: {
      expectedNormalizedName: string;
      expectedNormalizedLocality: string;
      expectedUpdatedAt: string | Date;
      allowManualOverride?: boolean;
    },
  ): Promise<GlobalLocationZone | null> {
    const pool = getPool();
    const allowManualOverride = Boolean(expected.allowManualOverride);
    const expectedUpdatedAt =
      expected.expectedUpdatedAt instanceof Date
        ? expected.expectedUpdatedAt
        : new Date(expected.expectedUpdatedAt);
    if (!Number.isFinite(expectedUpdatedAt.getTime())) {
      throw new Error("applyGeocodeResult requires a valid expectedUpdatedAt");
    }

    const result = await pool
      .request()
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .input("centroidLatitude", sql.Decimal(10, 7), write.centroidLatitude)
      .input("centroidLongitude", sql.Decimal(10, 7), write.centroidLongitude)
      .input("geocodingStatus", sql.NVarChar(20), write.geocodingStatus)
      .input("geocodingSource", sql.NVarChar(20), write.geocodingSource)
      .input("geocodedAt", sql.DateTime2, write.geocodedAt)
      .input("geocodingLastError", sql.NVarChar(500), write.geocodingLastError)
      .input("expectedNormalizedName", sql.NVarChar(120), expected.expectedNormalizedName)
      .input(
        "expectedNormalizedLocality",
        sql.NVarChar(120),
        expected.expectedNormalizedLocality,
      )
      .input("expectedUpdatedAt", sql.DateTime2, expectedUpdatedAt)
      .input("allowManualOverride", sql.Bit, allowManualOverride ? 1 : 0)
      .query(`
        UPDATE location_zones
        SET
          centroid_latitude = @centroidLatitude,
          centroid_longitude = @centroidLongitude,
          geocoding_status = @geocodingStatus,
          geocoding_source = @geocodingSource,
          geocoded_at = @geocodedAt,
          geocoding_last_error = @geocodingLastError,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @zoneId
          AND normalized_name = @expectedNormalizedName
          AND normalized_locality = @expectedNormalizedLocality
          AND ABS(DATEDIFF_BIG(MILLISECOND, updated_at, @expectedUpdatedAt)) <= 1
          AND (
            @allowManualOverride = 1
            OR (
              (geocoding_source IS NULL OR geocoding_source <> N'MANUAL')
              AND (geocoding_status IS NULL OR geocoding_status <> N'MANUAL')
            )
          )
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>, null);
  },

  async getGeocodingSummaryForCompany(companyId: string): Promise<{
    total: number;
    resolved: number;
    manual: number;
    pending: number;
    failed: number;
    withCoordinates: number;
    withoutCoordinates: number;
    coveragePercent: number;
    canonicalized: number;
    missingLocality: number;
    unknownLocality: number;
  }> {
    const pool = getPool();
    const [countsResult, localitiesResult] = await Promise.all([
      pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN lz.geocoding_status = N'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN lz.geocoding_status = N'MANUAL' THEN 1 ELSE 0 END) AS manual,
            SUM(
              CASE
                WHEN lz.geocoding_status = N'PENDING' OR lz.geocoding_status IS NULL THEN 1
                ELSE 0
              END
            ) AS pending,
            SUM(CASE WHEN lz.geocoding_status = N'FAILED' THEN 1 ELSE 0 END) AS failed,
            SUM(
              CASE
                WHEN lz.centroid_latitude IS NOT NULL AND lz.centroid_longitude IS NOT NULL THEN 1
                ELSE 0
              END
            ) AS with_coordinates,
            SUM(
              CASE
                WHEN lz.centroid_latitude IS NULL OR lz.centroid_longitude IS NULL THEN 1
                ELSE 0
              END
            ) AS without_coordinates
          FROM company_location_zones clz
          INNER JOIN location_zones lz ON lz.id = clz.location_zone_id
          WHERE clz.company_id = @companyId
            AND clz.is_active = 1
            AND lz.is_active = 1
        `),
      pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT lz.locality
          FROM company_location_zones clz
          INNER JOIN location_zones lz ON lz.id = clz.location_zone_id
          WHERE clz.company_id = @companyId
            AND clz.is_active = 1
            AND lz.is_active = 1
        `),
    ]);

    const row = (countsResult.recordset[0] ?? {}) as Record<string, unknown>;
    const coverage = buildGeocodingCoverageSummary({
      total: Number(row.total ?? 0),
      resolved: Number(row.resolved ?? 0),
      manual: Number(row.manual ?? 0),
      pending: Number(row.pending ?? 0),
      failed: Number(row.failed ?? 0),
      withCoordinates: Number(row.with_coordinates ?? 0),
      withoutCoordinates: Number(row.without_coordinates ?? 0),
    });
    const canonical = summarizeCanonicalLocalities(
      (localitiesResult.recordset as Array<{ locality: string | null }>).map(
        (item) => item.locality,
      ),
    );

    return { ...coverage, ...canonical };
  },
};
