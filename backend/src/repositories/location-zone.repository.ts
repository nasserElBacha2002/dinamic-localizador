import sql from "mssql";
import { getPool } from "../database/connection";
import type { UpdateLocationZoneInput } from "../schemas/location-zone.schema";
import type {
  LocationZone,
  LocationZoneGeocodingSource,
  LocationZoneGeocodingStatus,
} from "../types/location-zone";
import { buildGeocodingCoverageSummary, summarizeCanonicalLocalities } from "../utils/location-zone-geocoding-summary";

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

export const mapLocationZoneRow = (row: Record<string, unknown>): LocationZone => ({
  id: String(row.id),
  companyId: String(row.company_id),
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
  isActive: Boolean(row.is_active),
  assignedEmployeesCount:
    row.assigned_employees_count !== undefined && row.assigned_employees_count !== null
      ? Number(row.assigned_employees_count)
      : undefined,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

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

  /**
   * Zones eligible for automatic geocoding backfill:
   * - not MANUAL
   * - missing centroids OR FAILED/PENDING status
   * Already RESOLVED with both centroids are excluded.
   */
  async listEligibleForGeocoding(options: {
    companyId?: string;
    includeFailed?: boolean;
  }): Promise<LocationZone[]> {
    const pool = getPool();
    const includeFailed = options.includeFailed !== false;
    const request = pool.request();

    const companyFilter = options.companyId
      ? "AND company_id = @companyId"
      : "";
    if (options.companyId) {
      request.input("companyId", sql.UniqueIdentifier, options.companyId);
    }

    const failedClause = includeFailed
      ? "OR geocoding_status = N'FAILED'"
      : "";

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
      ORDER BY company_id ASC, name ASC, locality ASC
    `);

    return result.recordset.map((row) => mapLocationZoneRow(row as Record<string, unknown>));
  },

  async create(companyId: string, input: LocationZoneCreateInput): Promise<LocationZone> {
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
      .input("geocodingStatus", sql.NVarChar(20), input.geocodingStatus ?? null)
      .input("geocodingSource", sql.NVarChar(20), input.geocodingSource ?? null)
      .input("geocodedAt", sql.DateTime2, input.geocodedAt ?? null)
      .input("geocodingLastError", sql.NVarChar(500), input.geocodingLastError ?? null)
      .query(`
        INSERT INTO location_zones (
          company_id,
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
          @companyId,
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
      geocodingStatus?: LocationZoneGeocodingStatus | null;
      geocodingSource?: LocationZoneGeocodingSource | null;
      geocodedAt?: Date | null;
      geocodingLastError?: string | null;
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

  /**
   * Persist an external geocode result only when the row snapshot still matches.
   * Concurrency: normalized name/locality + updated_at (ms). `allowManualOverride`
   * (force) may replace MANUAL but never skips the snapshot check.
   */
  async applyGeocodeResult(
    companyId: string,
    zoneId: string,
    write: LocationZoneGeocodingWrite,
    expected: {
      expectedNormalizedName: string;
      expectedNormalizedLocality: string;
      expectedUpdatedAt: string | Date;
      allowManualOverride?: boolean;
    },
  ): Promise<LocationZone | null> {
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
      .input("companyId", sql.UniqueIdentifier, companyId)
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
          AND company_id = @companyId
          AND normalized_name = @expectedNormalizedName
          AND normalized_locality = @expectedNormalizedLocality
          AND CAST(updated_at AS DATETIME2(3)) = CAST(@expectedUpdatedAt AS DATETIME2(3))
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

    return mapLocationZoneRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Aggregated geocoding coverage for active zones only (inactive excluded).
   * coveragePercent = withCoordinates / total * 100 (0 when total is 0).
   * Canonical locality counts are derived in Node from the alias table (no schema column).
   */
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
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const [countsResult, localitiesResult] = await Promise.all([
      request.query(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN geocoding_status = N'RESOLVED' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN geocoding_status = N'MANUAL' THEN 1 ELSE 0 END) AS manual,
          SUM(
            CASE
              WHEN geocoding_status = N'PENDING' OR geocoding_status IS NULL THEN 1
              ELSE 0
            END
          ) AS pending,
          SUM(CASE WHEN geocoding_status = N'FAILED' THEN 1 ELSE 0 END) AS failed,
          SUM(
            CASE
              WHEN centroid_latitude IS NOT NULL AND centroid_longitude IS NOT NULL THEN 1
              ELSE 0
            END
          ) AS with_coordinates,
          SUM(
            CASE
              WHEN centroid_latitude IS NULL OR centroid_longitude IS NULL THEN 1
              ELSE 0
            END
          ) AS without_coordinates
        FROM location_zones
        WHERE company_id = @companyId
          AND is_active = 1
      `),
      pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT locality
          FROM location_zones
          WHERE company_id = @companyId
            AND is_active = 1
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
