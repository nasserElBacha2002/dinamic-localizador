// Phase 2.3/2.7: Inventory remains the technical API model; physical table is scheduled_operations (inventories view).
// Conceptually this represents a ScheduledOperation — see types/operational-domain.ts.
import sql from "mssql";
import { getPool } from "../database/connection";
import type { Inventory, InventoryDetail, InventoryWithStore } from "../types/domain";
import type { CompatibleInventory } from "../types/twilio.types";
import {
  mapInventoryDetail,
  mapInventoryRow,
  mapInventoryWithStoreRow,
  mapEmployeeRow,
  mapStoreRow,
} from "../utils/row-mappers";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { resolveSqlSort } from "../utils/sql-sort";
import type {
  CreateInventoryInput,
  ListInventoriesQuery,
  UpdateInventoryInput,
} from "../schemas/inventory.schema";

const INVENTORY_LIST_SORT_FIELDS: Record<string, string> = {
  storeName: "s.name",
  storeAddress: "s.address",
  scheduledStart: "i.scheduled_start",
  scheduledEnd: "i.scheduled_end",
  status: "i.status",
  earlyToleranceMinutes: "i.early_tolerance_minutes",
  lateToleranceMinutes: "i.late_tolerance_minutes",
};

export const inventoryRepository = {
  async create(companyId: string, input: CreateInventoryInput): Promise<Inventory> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("storeId", sql.UniqueIdentifier, input.storeId)
      .input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart))
      .input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("notes", sql.NVarChar(1000), input.notes ?? null)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, store_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @storeId, @scheduledStart, @scheduledEnd,
          @earlyToleranceMinutes, @lateToleranceMinutes, @notes
        )
      `);

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async createInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: CreateInventoryInput,
  ): Promise<Inventory> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("storeId", sql.UniqueIdentifier, input.storeId)
      .input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart))
      .input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("notes", sql.NVarChar(1000), input.notes ?? null)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, store_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @storeId, @scheduledStart, @scheduledEnd,
          @earlyToleranceMinutes, @lateToleranceMinutes, @notes
        )
      `);

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async existsActiveForStoreAtStart(
    companyId: string,
    storeId: string,
    scheduledStart: string,
  ): Promise<boolean> {
    const existing = await this.findExistingActiveKeys(companyId, [{ storeId, scheduledStart }]);
    return existing.size > 0;
  },

  async findExistingActiveKeys(
    companyId: string,
    pairs: Array<{ storeId: string; scheduledStart: string }>,
  ): Promise<Set<string>> {
    if (pairs.length === 0) {
      return new Set();
    }

    const pool = getPool();
    const existing = new Set<string>();
    const chunkSize = 100;

    for (let offset = 0; offset < pairs.length; offset += chunkSize) {
      const chunk = pairs.slice(offset, offset + chunkSize);
      const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
      const valueClauses: string[] = [];

      chunk.forEach((pair, index) => {
        request.input(`storeId${index}`, sql.UniqueIdentifier, pair.storeId);
        request.input(`scheduledStart${index}`, sql.DateTime2, new Date(pair.scheduledStart));
        valueClauses.push(`(@storeId${index}, @scheduledStart${index})`);
      });

      const result = await request.query(`
        SELECT i.store_id, i.scheduled_start
        FROM scheduled_operations i
        INNER JOIN (VALUES ${valueClauses.join(", ")}) AS p(store_id, scheduled_start)
          ON i.store_id = p.store_id
         AND i.scheduled_start = p.scheduled_start
        WHERE i.status <> 'CANCELLED'
          AND i.company_id = @companyId
      `);

      for (const row of result.recordset) {
        const storeId = String(row.store_id);
        const scheduledStart = new Date(row.scheduled_start as Date | string).toISOString();
        existing.add(`${storeId}|${scheduledStart}`);
      }
    }

    return existing;
  },

  async createManyInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    inputs: CreateInventoryInput[],
  ): Promise<Inventory[]> {
    if (inputs.length === 0) {
      return [];
    }

    const created: Inventory[] = [];
    const chunkSize = 100;

    for (let offset = 0; offset < inputs.length; offset += chunkSize) {
      const chunk = inputs.slice(offset, offset + chunkSize);
      const request = new sql.Request(transaction).input("companyId", sql.UniqueIdentifier, companyId);
      const valueRows: string[] = [];

      chunk.forEach((input, index) => {
        request.input(`storeId${index}`, sql.UniqueIdentifier, input.storeId);
        request.input(`scheduledStart${index}`, sql.DateTime2, new Date(input.scheduledStart));
        request.input(
          `scheduledEnd${index}`,
          sql.DateTime2,
          input.scheduledEnd ? new Date(input.scheduledEnd) : null,
        );
        request.input(`earlyToleranceMinutes${index}`, sql.Int, input.earlyToleranceMinutes);
        request.input(`lateToleranceMinutes${index}`, sql.Int, input.lateToleranceMinutes);
        request.input(`notes${index}`, sql.NVarChar(1000), input.notes ?? null);
        valueRows.push(
          `(@companyId, @storeId${index}, @scheduledStart${index}, @scheduledEnd${index}, @earlyToleranceMinutes${index}, @lateToleranceMinutes${index}, @notes${index})`,
        );
      });

      const result = await request.query(`
        INSERT INTO scheduled_operations (
          company_id, store_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES ${valueRows.join(", ")}
      `);

      created.push(
        ...result.recordset.map((row) => mapInventoryRow(row as Record<string, unknown>)),
      );
    }

    return created;
  },

  async findById(companyId: string, id: string): Promise<Inventory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM scheduled_operations WHERE id = @id AND company_id = @companyId");

    if (!result.recordset[0]) {
      return null;
    }

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async findDetailById(companyId: string, id: string): Promise<InventoryDetail | null> {
    const inventory = await this.findById(companyId, id);
    if (!inventory) {
      return null;
    }

    const pool = getPool();

    const storeResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("storeId", sql.UniqueIdentifier, inventory.storeId)
      .query("SELECT * FROM operational_locations WHERE id = @storeId AND company_id = @companyId");

    if (!storeResult.recordset[0]) {
      return null;
    }

    const employeesResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, id)
      .query(`
      SELECT e.*
      FROM operation_assignments ie
      INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
      WHERE ie.inventory_id = @inventoryId
        AND ie.company_id = @companyId
        AND e.company_id = @companyId
      ORDER BY e.name ASC
    `);

    const attendanceCountResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, id)
      .query(`
        SELECT COUNT(*) AS total
        FROM attendance_records
        WHERE inventory_id = @inventoryId
          AND company_id = @companyId
      `);

    return mapInventoryDetail(
      inventory,
      mapStoreRow(storeResult.recordset[0] as Record<string, unknown>),
      employeesResult.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>)),
      Number(attendanceCountResult.recordset[0].total),
    );
  },

  async list(
    companyId: string,
    query: ListInventoriesQuery,
  ): Promise<{ items: InventoryWithStore[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [
      {
        clause: "i.company_id = @companyId",
        apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.status) {
      filters.push({
        clause: "i.status = @status",
        apply: (request) => request.input("status", sql.NVarChar(30), query.status),
      });
    }

    if (query.storeId) {
      filters.push({
        clause: "i.store_id = @storeId",
        apply: (request) => request.input("storeId", sql.UniqueIdentifier, query.storeId),
      });
    }

    if (query.search) {
      filters.push({
        clause: "(s.name LIKE @search OR s.address LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(150), `%${query.search}%`),
      });
    }

    if (query.dateFrom) {
      const dateFrom = query.dateFrom;
      filters.push({
        clause: "i.scheduled_start >= @dateFrom",
        apply: (request) => request.input("dateFrom", sql.DateTime2, new Date(dateFrom)),
      });
    }

    if (query.dateTo) {
      const dateTo = query.dateTo;
      filters.push({
        clause: "i.scheduled_start <= @dateTo",
        apply: (request) => request.input("dateTo", sql.DateTime2, new Date(dateTo)),
      });
    }

    const whereClause = buildWhereClause(filters);

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM scheduled_operations i
      INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = i.company_id
      ${whereClause}
    `);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const orderBy = resolveSqlSort(
      query.sortBy,
      INVENTORY_LIST_SORT_FIELDS,
      "i.scheduled_start",
      query.sortDirection ?? "asc",
    );

    const dataResult = await dataRequest.query(`
      SELECT
        i.*,
        s.name AS store_name,
        s.address AS store_address,
        s.active AS store_active
      FROM scheduled_operations i
      INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = i.company_id
      ${whereClause}
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) =>
        mapInventoryWithStoreRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async update(
    companyId: string,
    id: string,
    input: UpdateInventoryInput,
    transaction?: sql.Transaction,
  ): Promise<Inventory | null> {
    const request = transaction
      ? new sql.Request(transaction)
      : getPool().request();

    const fields: string[] = [];
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("id", sql.UniqueIdentifier, id);

    if (input.storeId !== undefined) {
      request.input("storeId", sql.UniqueIdentifier, input.storeId);
      fields.push("store_id = @storeId");
    }

    if (input.scheduledStart !== undefined) {
      request.input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart));
      fields.push("scheduled_start = @scheduledStart");
    }

    if (input.scheduledEnd !== undefined) {
      request.input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null);
      fields.push("scheduled_end = @scheduledEnd");
    }

    if (input.earlyToleranceMinutes !== undefined) {
      request.input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes);
      fields.push("early_tolerance_minutes = @earlyToleranceMinutes");
    }

    if (input.lateToleranceMinutes !== undefined) {
      request.input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes);
      fields.push("late_tolerance_minutes = @lateToleranceMinutes");
    }

    if (input.notes !== undefined) {
      request.input("notes", sql.NVarChar(1000), input.notes);
      fields.push("notes = @notes");
    }

    if (input.status !== undefined) {
      request.input("status", sql.NVarChar(30), input.status);
      fields.push("status = @status");
    }

    if (fields.length === 0) {
      return this.findById(companyId, id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE scheduled_operations
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id AND company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async cancel(companyId: string, id: string): Promise<Inventory | null> {
    return this.update(companyId, id, { status: "CANCELLED" });
  },

  async findCompatibleForEmployee(
    companyId: string,
    employeeId: string,
    at: Date,
  ): Promise<CompatibleInventory[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT
          i.id,
          i.store_id,
          i.scheduled_start,
          i.scheduled_end,
          i.early_tolerance_minutes,
          i.late_tolerance_minutes,
          i.status,
          s.name AS store_name,
          s.latitude AS store_latitude,
          s.longitude AS store_longitude,
          s.allowed_radius_meters
        FROM scheduled_operations i
        INNER JOIN operation_assignments ie
          ON ie.inventory_id = i.id AND ie.employee_id = @employeeId AND ie.company_id = @companyId
        INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = @companyId
        WHERE i.company_id = @companyId
          AND i.status NOT IN ('COMPLETED', 'CANCELLED')
          AND s.active = 1
          AND @at >= DATEADD(MINUTE, -i.early_tolerance_minutes, i.scheduled_start)
          AND @at <= DATEADD(MINUTE, i.late_tolerance_minutes, i.scheduled_start)
        ORDER BY i.scheduled_start ASC
      `);

    return result.recordset.map((row) => ({
      id: String(row.id),
      storeId: String(row.store_id),
      storeName: String(row.store_name),
      storeLatitude: Number(row.store_latitude),
      storeLongitude: Number(row.store_longitude),
      allowedRadiusMeters: Number(row.allowed_radius_meters),
      scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
      scheduledEnd: row.scheduled_end
        ? new Date(row.scheduled_end as Date | string).toISOString()
        : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
      status: String(row.status),
    }));
  },
};
