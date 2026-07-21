import sql from "mssql";
import { getPool } from "../database/connection";
import type { Service } from "../types/domain";
import { mapServiceRow } from "../utils/row-mappers";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { resolveSqlSort } from "../utils/sql-sort";
import type { CreateServiceInput, ListServicesQuery, UpdateServiceInput } from "../schemas/service.schema";

const SERVICE_LIST_SORT_COLUMNS: Record<string, string> = {
  name: "name",
  neighborhood: "neighborhood",
  locality: "locality",
  serviceFormat: "store_format",
  address: "address",
  active: "active",
  createdAt: "created_at",
};

export interface ServiceGeoFacets {
  localities: string[];
  neighborhoodsByLocality: Record<string, string[]>;
}

export const serviceRepository = {
  async create(companyId: string, input: CreateServiceInput): Promise<Service> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), input.name)
      .input("address", sql.NVarChar(300), input.address ?? null)
      .input("neighborhood", sql.NVarChar(150), input.neighborhood ?? null)
      .input("locality", sql.NVarChar(150), input.locality ?? null)
      .input("serviceFormat", sql.NVarChar(50), input.serviceFormat ?? null)
      .input("latitude", sql.Decimal(10, 7), input.latitude)
      .input("longitude", sql.Decimal(10, 7), input.longitude)
      .input("allowedRadiusMeters", sql.Int, input.allowedRadiusMeters)
      .input("googlePlaceId", sql.NVarChar(255), input.googlePlaceId ?? null)
      .query(`
        INSERT INTO operational_locations (
          company_id, name, address, neighborhood, locality, store_format,
          latitude, longitude, allowed_radius_meters, google_place_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @name, @address, @neighborhood, @locality, @serviceFormat,
          @latitude, @longitude, @allowedRadiusMeters, @googlePlaceId
        )
      `);

    return mapServiceRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, id: string): Promise<Service | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM operational_locations WHERE id = @id AND company_id = @companyId");

    if (!result.recordset[0]) {
      return null;
    }

    return mapServiceRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByCompanyAndName(companyId: string, name: string): Promise<Service | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), name)
      .query(`
        SELECT TOP 1 *
        FROM operational_locations
        WHERE company_id = @companyId
          AND name = @name
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapServiceRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByCompanyAndNameExcludingId(
    companyId: string,
    name: string,
    excludeId: string,
  ): Promise<Service | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), name)
      .input("excludeId", sql.UniqueIdentifier, excludeId)
      .query(`
        SELECT TOP 1 *
        FROM operational_locations
        WHERE company_id = @companyId
          AND name = @name
          AND id <> @excludeId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapServiceRow(result.recordset[0] as Record<string, unknown>);
  },

  async list(
    companyId: string,
    query: ListServicesQuery,
  ): Promise<{ items: Service[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [
      {
        clause: "company_id = @companyId",
        apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.active !== undefined) {
      filters.push({
        clause: "active = @active",
        apply: (request) => request.input("active", sql.Bit, query.active),
      });
    }

    if (query.search) {
      filters.push({
        clause: "(name LIKE @search OR address LIKE @search OR neighborhood LIKE @search OR locality LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(150), `%${query.search}%`),
      });
    }

    if (query.serviceFormat) {
      filters.push({
        clause: "store_format = @serviceFormat",
        apply: (request) => request.input("serviceFormat", sql.NVarChar(80), query.serviceFormat),
      });
    }

    if (query.locality) {
      filters.push({
        clause: "LTRIM(RTRIM(locality)) = @locality",
        apply: (request) => request.input("locality", sql.NVarChar(150), query.locality),
      });
    }

    if (query.neighborhood) {
      filters.push({
        clause: "LTRIM(RTRIM(neighborhood)) = @neighborhood",
        apply: (request) => request.input("neighborhood", sql.NVarChar(150), query.neighborhood),
      });
    }

    const whereClause = buildWhereClause(filters);
    const sortDirection: "asc" | "desc" = query.sortBy ? query.sortDirection : "desc";
    const orderBy = resolveSqlSort(
      query.sortBy,
      SERVICE_LIST_SORT_COLUMNS,
      "created_at",
      sortDirection,
    );

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM operational_locations ${whereClause}`);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const dataResult = await dataRequest.query(`
      SELECT *
      FROM operational_locations
      ${whereClause}
      ORDER BY ${orderBy}, id ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) => mapServiceRow(row as Record<string, unknown>)),
      total,
    };
  },

  async listGeoFacets(companyId: string): Promise<ServiceGeoFacets> {
    const pool = getPool();
    const localitiesResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT DISTINCT LTRIM(RTRIM(locality)) AS locality
        FROM operational_locations
        WHERE company_id = @companyId
          AND locality IS NOT NULL
          AND LTRIM(RTRIM(locality)) <> N''
        ORDER BY locality ASC
      `);

    const neighborhoodsResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT DISTINCT
          LTRIM(RTRIM(locality)) AS locality,
          LTRIM(RTRIM(neighborhood)) AS neighborhood
        FROM operational_locations
        WHERE company_id = @companyId
          AND locality IS NOT NULL
          AND LTRIM(RTRIM(locality)) <> N''
          AND neighborhood IS NOT NULL
          AND LTRIM(RTRIM(neighborhood)) <> N''
        ORDER BY locality ASC, neighborhood ASC
      `);

    const localities = localitiesResult.recordset.map((row) => String(row.locality));
    const neighborhoodsByLocality: Record<string, string[]> = {};
    for (const row of neighborhoodsResult.recordset as Array<{
      locality: string;
      neighborhood: string;
    }>) {
      const locality = String(row.locality);
      const neighborhood = String(row.neighborhood);
      const current = neighborhoodsByLocality[locality] ?? [];
      current.push(neighborhood);
      neighborhoodsByLocality[locality] = current;
    }

    return { localities, neighborhoodsByLocality };
  },

  async listAllActive(companyId: string): Promise<Service[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query("SELECT * FROM operational_locations WHERE active = 1 AND company_id = @companyId");
    return result.recordset.map((row) => mapServiceRow(row as Record<string, unknown>));
  },

  async update(companyId: string, id: string, input: UpdateServiceInput): Promise<Service | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id);

    if (input.name !== undefined) {
      request.input("name", sql.NVarChar(150), input.name);
      fields.push("name = @name");
    }

    if (input.address !== undefined) {
      request.input("address", sql.NVarChar(300), input.address);
      fields.push("address = @address");
    }

    if (input.neighborhood !== undefined) {
      request.input("neighborhood", sql.NVarChar(150), input.neighborhood);
      fields.push("neighborhood = @neighborhood");
    }

    if (input.locality !== undefined) {
      request.input("locality", sql.NVarChar(150), input.locality);
      fields.push("locality = @locality");
    }

    if (input.serviceFormat !== undefined) {
      request.input("serviceFormat", sql.NVarChar(50), input.serviceFormat);
      fields.push("store_format = @serviceFormat");
    }

    if (input.latitude !== undefined) {
      request.input("latitude", sql.Decimal(10, 7), input.latitude);
      fields.push("latitude = @latitude");
    }

    if (input.longitude !== undefined) {
      request.input("longitude", sql.Decimal(10, 7), input.longitude);
      fields.push("longitude = @longitude");
    }

    if (input.allowedRadiusMeters !== undefined) {
      request.input("allowedRadiusMeters", sql.Int, input.allowedRadiusMeters);
      fields.push("allowed_radius_meters = @allowedRadiusMeters");
    }

    if (input.googlePlaceId !== undefined) {
      request.input("googlePlaceId", sql.NVarChar(255), input.googlePlaceId);
      fields.push("google_place_id = @googlePlaceId");
    }

    if (input.active !== undefined) {
      request.input("active", sql.Bit, input.active);
      fields.push("active = @active");
    }

    if (fields.length === 0) {
      return this.findById(companyId, id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE operational_locations
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id AND company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapServiceRow(result.recordset[0] as Record<string, unknown>);
  },

  async deactivate(companyId: string, id: string): Promise<Service | null> {
    return this.update(companyId, id, { active: false });
  },

  async hasActiveOrScheduledOperations(companyId: string, serviceId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM scheduled_operations
        WHERE service_id = @serviceId
          AND company_id = @companyId
          AND status IN ('SCHEDULED', 'IN_PROGRESS')
      `);

    return Boolean(result.recordset[0]);
  },
};
