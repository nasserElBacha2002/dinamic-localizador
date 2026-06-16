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
import type {
  CreateInventoryInput,
  ListInventoriesQuery,
  UpdateInventoryInput,
} from "../schemas/inventory.schema";

export const inventoryRepository = {
  async create(input: CreateInventoryInput): Promise<Inventory> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("storeId", sql.UniqueIdentifier, input.storeId)
      .input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart))
      .input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("notes", sql.NVarChar(1000), input.notes ?? null)
      .query(`
        INSERT INTO inventories (
          store_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @storeId, @scheduledStart, @scheduledEnd,
          @earlyToleranceMinutes, @lateToleranceMinutes, @notes
        )
      `);

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(id: string): Promise<Inventory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM inventories WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async findDetailById(id: string): Promise<InventoryDetail | null> {
    const inventory = await this.findById(id);
    if (!inventory) {
      return null;
    }

    const pool = getPool();

    const storeResult = await pool
      .request()
      .input("storeId", sql.UniqueIdentifier, inventory.storeId)
      .query("SELECT * FROM stores WHERE id = @storeId");

    if (!storeResult.recordset[0]) {
      return null;
    }

    const employeesResult = await pool.request().input("inventoryId", sql.UniqueIdentifier, id).query(`
      SELECT e.*
      FROM inventory_employees ie
      INNER JOIN employees e ON e.id = ie.employee_id
      WHERE ie.inventory_id = @inventoryId
      ORDER BY e.name ASC
    `);

    const attendanceCountResult = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, id)
      .query(`
        SELECT COUNT(*) AS total
        FROM attendance_records
        WHERE inventory_id = @inventoryId
      `);

    return mapInventoryDetail(
      inventory,
      mapStoreRow(storeResult.recordset[0] as Record<string, unknown>),
      employeesResult.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>)),
      Number(attendanceCountResult.recordset[0].total),
    );
  },

  async list(query: ListInventoriesQuery): Promise<{ items: InventoryWithStore[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [];

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
      FROM inventories i
      ${whereClause}
    `);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const dataResult = await dataRequest.query(`
      SELECT
        i.*,
        s.name AS store_name,
        s.address AS store_address,
        s.active AS store_active
      FROM inventories i
      INNER JOIN stores s ON s.id = i.store_id
      ${whereClause}
      ORDER BY i.scheduled_start DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) =>
        mapInventoryWithStoreRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async update(id: string, input: UpdateInventoryInput): Promise<Inventory | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool.request().input("id", sql.UniqueIdentifier, id);

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
      return this.findById(id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE inventories
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapInventoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async cancel(id: string): Promise<Inventory | null> {
    return this.update(id, { status: "CANCELLED" });
  },

  async findCompatibleForEmployee(
    employeeId: string,
    at: Date,
  ): Promise<CompatibleInventory[]> {
    const pool = getPool();
    const result = await pool
      .request()
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
        FROM inventories i
        INNER JOIN inventory_employees ie
          ON ie.inventory_id = i.id AND ie.employee_id = @employeeId
        INNER JOIN stores s ON s.id = i.store_id
        WHERE i.status NOT IN ('COMPLETED', 'CANCELLED')
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
