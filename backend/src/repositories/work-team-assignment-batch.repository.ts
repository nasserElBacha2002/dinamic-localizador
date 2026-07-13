import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import type {
  WorkTeamAssignmentBatch,
  WorkTeamAssignmentBatchItem,
  WorkTeamAssignmentBatchTeam,
  WorkTeamUsageRecord,
} from "../types/work-team";
import type { WorkTeamAssignmentBatchStatus, WorkTeamAssignmentItemResult, WorkTeamAssignmentSkipReason } from "../constants/work-team-assignment";
import { mapEmployeeRow, toDateOnlyString } from "../utils/row-mappers";

const mapBatchRow = (row: Record<string, unknown>): WorkTeamAssignmentBatch => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  requestedBy: row.requested_by ? String(row.requested_by) : null,
  requestedAt: new Date(row.requested_at as Date | string).toISOString(),
  validFrom: row.valid_from ? toDateOnlyString(row.valid_from as Date | string) : null,
  validUntil: row.valid_until ? toDateOnlyString(row.valid_until as Date | string) : null,
  status: String(row.status) as WorkTeamAssignmentBatchStatus,
  previewExpiresAt: row.preview_expires_at
    ? new Date(row.preview_expires_at as Date | string).toISOString()
    : null,
  membersSnapshotHash: row.members_snapshot_hash ? String(row.members_snapshot_hash) : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  completedAt: row.completed_at ? new Date(row.completed_at as Date | string).toISOString() : null,
});

const mapBatchTeamRow = (row: Record<string, unknown>): WorkTeamAssignmentBatchTeam => ({
  batchId: String(row.batch_id),
  workTeamId: String(row.work_team_id),
  workTeamNameSnapshot: String(row.work_team_name_snapshot),
  workTeamUpdatedAtSnapshot: new Date(row.work_team_updated_at_snapshot as Date | string).toISOString(),
  membersSnapshotHash: String(row.members_snapshot_hash),
  assignmentVersionSnapshot: Number(row.assignment_version_snapshot ?? 0),
});

const mapBatchItemRow = (row: Record<string, unknown>): WorkTeamAssignmentBatchItem => ({
  id: String(row.id),
  batchId: String(row.batch_id),
  workTeamId: row.work_team_id ? String(row.work_team_id) : null,
  employeeId: String(row.employee_id),
  operationAssignmentId: row.operation_assignment_id ? String(row.operation_assignment_id) : null,
  result: String(row.result) as WorkTeamAssignmentItemResult,
  reason: row.reason ? (String(row.reason) as WorkTeamAssignmentSkipReason) : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  employee: row.employee_name
    ? mapEmployeeRow({
        id: row.employee_id,
        name: row.employee_name,
        document_number: row.employee_document_number,
        phone_number: row.employee_phone_number,
        employee_type: row.employee_type,
        active: row.employee_active,
        created_at: row.employee_created_at,
        updated_at: row.employee_updated_at,
      })
    : undefined,
});

export const workTeamAssignmentBatchRepository = {
  async createPreviewInTransaction(
    transaction: sql.Transaction,
    input: {
      companyId: string;
      operationId: string;
      requestedBy: string | null;
      validFrom: string | null;
      validUntil: string | null;
      previewExpiresAt: Date;
      membersSnapshotHash: string;
    },
  ): Promise<WorkTeamAssignmentBatch> {
    const batchId = randomUUID();
    const result = await new sql.Request(transaction)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("requestedBy", sql.UniqueIdentifier, input.requestedBy)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil)
      .input("previewExpiresAt", sql.DateTime2, input.previewExpiresAt)
      .input("membersSnapshotHash", sql.NVarChar(128), input.membersSnapshotHash)
      .query(`
        INSERT INTO work_team_assignment_batches (
          id, company_id, operation_id, requested_by, valid_from, valid_until,
          status, preview_expires_at, members_snapshot_hash
        )
        OUTPUT INSERTED.*
        VALUES (
          @batchId, @companyId, @operationId, @requestedBy, @validFrom, @validUntil,
          N'PREVIEWED', @previewExpiresAt, @membersSnapshotHash
        )
      `);

    return mapBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async addBatchTeamInTransaction(
    transaction: sql.Transaction,
    input: WorkTeamAssignmentBatchTeam,
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("batchId", sql.UniqueIdentifier, input.batchId)
      .input("workTeamId", sql.UniqueIdentifier, input.workTeamId)
      .input("workTeamNameSnapshot", sql.NVarChar(200), input.workTeamNameSnapshot)
      .input("workTeamUpdatedAtSnapshot", sql.DateTime2, new Date(input.workTeamUpdatedAtSnapshot))
      .input("membersSnapshotHash", sql.NVarChar(128), input.membersSnapshotHash)
      .input("assignmentVersionSnapshot", sql.Int, input.assignmentVersionSnapshot)
      .query(`
        INSERT INTO work_team_assignment_batch_teams (
          batch_id, work_team_id, work_team_name_snapshot,
          work_team_updated_at_snapshot, members_snapshot_hash, assignment_version_snapshot
        )
        VALUES (
          @batchId, @workTeamId, @workTeamNameSnapshot,
          @workTeamUpdatedAtSnapshot, @membersSnapshotHash, @assignmentVersionSnapshot
        )
      `);
  },

  async findByIdForUpdate(
    companyId: string,
    batchId: string,
    transaction: sql.Transaction,
  ): Promise<WorkTeamAssignmentBatch | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT *
        FROM work_team_assignment_batches WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @batchId AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, batchId: string): Promise<WorkTeamAssignmentBatch | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT *
        FROM work_team_assignment_batches
        WHERE id = @batchId AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async listBatchTeamsInTransaction(
    companyId: string,
    batchId: string,
    transaction: sql.Transaction,
  ): Promise<WorkTeamAssignmentBatchTeam[]> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT bt.*
        FROM work_team_assignment_batch_teams bt
        INNER JOIN work_team_assignment_batches b ON b.id = bt.batch_id AND b.company_id = @companyId
        WHERE bt.batch_id = @batchId
      `);

    return result.recordset.map((row) => mapBatchTeamRow(row as Record<string, unknown>));
  },

  async listBatchTeams(companyId: string, batchId: string): Promise<WorkTeamAssignmentBatchTeam[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT bt.*
        FROM work_team_assignment_batch_teams bt
        INNER JOIN work_team_assignment_batches b ON b.id = bt.batch_id AND b.company_id = @companyId
        WHERE bt.batch_id = @batchId
      `);

    return result.recordset.map((row) => mapBatchTeamRow(row as Record<string, unknown>));
  },

  async listBatchItems(companyId: string, batchId: string): Promise<WorkTeamAssignmentBatchItem[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT
          bi.*,
          e.name AS employee_name,
          e.document_number AS employee_document_number,
          e.phone_number AS employee_phone_number,
          e.employee_type AS employee_type,
          e.active AS employee_active,
          e.created_at AS employee_created_at,
          e.updated_at AS employee_updated_at
        FROM work_team_assignment_batch_items bi
        INNER JOIN work_team_assignment_batches b ON b.id = bi.batch_id AND b.company_id = @companyId
        LEFT JOIN employees e ON e.id = bi.employee_id AND e.company_id = @companyId
        WHERE bi.batch_id = @batchId
        ORDER BY bi.created_at ASC
      `);

    return result.recordset.map((row) => mapBatchItemRow(row as Record<string, unknown>));
  },

  async addBatchItemInTransaction(
    transaction: sql.Transaction,
    input: {
      batchId: string;
      workTeamId: string | null;
      employeeId: string;
      operationAssignmentId: string | null;
      result: WorkTeamAssignmentItemResult;
      reason: WorkTeamAssignmentSkipReason | null;
    },
  ): Promise<WorkTeamAssignmentBatchItem> {
    const itemId = randomUUID();
    const queryResult = await new sql.Request(transaction)
      .input("itemId", sql.UniqueIdentifier, itemId)
      .input("batchId", sql.UniqueIdentifier, input.batchId)
      .input("workTeamId", sql.UniqueIdentifier, input.workTeamId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("operationAssignmentId", sql.UniqueIdentifier, input.operationAssignmentId)
      .input("result", sql.NVarChar(20), input.result)
      .input("reason", sql.NVarChar(50), input.reason)
      .query(`
        INSERT INTO work_team_assignment_batch_items (
          id, batch_id, work_team_id, employee_id, operation_assignment_id, result, reason
        )
        OUTPUT INSERTED.*
        VALUES (
          @itemId, @batchId, @workTeamId, @employeeId, @operationAssignmentId, @result, @reason
        )
      `);

    return mapBatchItemRow(queryResult.recordset[0] as Record<string, unknown>);
  },

  async addBatchItemSourceInTransaction(
    transaction: sql.Transaction,
    input: {
      batchItemId: string;
      workTeamId: string;
      isPrimary: boolean;
    },
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("batchItemId", sql.UniqueIdentifier, input.batchItemId)
      .input("workTeamId", sql.UniqueIdentifier, input.workTeamId)
      .input("isPrimary", sql.Bit, input.isPrimary ? 1 : 0)
      .query(`
        INSERT INTO work_team_assignment_batch_item_sources (
          batch_item_id, work_team_id, is_primary
        )
        VALUES (@batchItemId, @workTeamId, @isPrimary)
      `);
  },

  async listBatchItemSources(
    companyId: string,
    batchId: string,
  ): Promise<Array<{ batchItemId: string; workTeamId: string; isPrimary: boolean }>> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        SELECT bis.batch_item_id, bis.work_team_id, bis.is_primary
        FROM work_team_assignment_batch_item_sources bis
        INNER JOIN work_team_assignment_batch_items bi ON bi.id = bis.batch_item_id
        INNER JOIN work_team_assignment_batches b ON b.id = bi.batch_id AND b.company_id = @companyId
        WHERE bi.batch_id = @batchId
      `);

    return result.recordset.map((row) => ({
      batchItemId: String(row.batch_item_id),
      workTeamId: String(row.work_team_id),
      isPrimary: Boolean(row.is_primary),
    }));
  },

  async markCompletedInTransaction(
    transaction: sql.Transaction,
    batchId: string,
  ): Promise<WorkTeamAssignmentBatch | null> {
    const result = await new sql.Request(transaction)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        UPDATE work_team_assignment_batches
        SET status = N'COMPLETED', completed_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @batchId
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapBatchRow(result.recordset[0] as Record<string, unknown>);
  },

  async markFailedInTransaction(transaction: sql.Transaction, batchId: string): Promise<void> {
    await new sql.Request(transaction)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        UPDATE work_team_assignment_batches
        SET status = N'FAILED'
        WHERE id = @batchId AND status = N'PREVIEWED'
      `);
  },

  async markFailed(companyId: string, batchId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        UPDATE work_team_assignment_batches
        SET status = N'FAILED'
        WHERE id = @batchId
          AND company_id = @companyId
          AND status = N'PREVIEWED'
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async markExpiredInTransaction(transaction: sql.Transaction, batchId: string): Promise<void> {
    await new sql.Request(transaction)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        UPDATE work_team_assignment_batches
        SET status = N'EXPIRED'
        WHERE id = @batchId AND status = N'PREVIEWED'
      `);
  },

  async markStaleInTransaction(transaction: sql.Transaction, batchId: string): Promise<void> {
    await new sql.Request(transaction)
      .input("batchId", sql.UniqueIdentifier, batchId)
      .query(`
        UPDATE work_team_assignment_batches
        SET status = N'STALE'
        WHERE id = @batchId AND status = N'PREVIEWED'
      `);
  },

  async expireStalePreviews(companyId: string, olderThan: Date): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("olderThan", sql.DateTime2, olderThan)
      .query(`
        UPDATE work_team_assignment_batches
        SET status = N'EXPIRED'
        WHERE company_id = @companyId
          AND status = N'PREVIEWED'
          AND preview_expires_at IS NOT NULL
          AND preview_expires_at < SYSUTCDATETIME()
      `);

    return result.rowsAffected[0] ?? 0;
  },

  async listUsageByWorkTeam(
    companyId: string,
    workTeamId: string,
    query: { page: number; limit: number },
  ): Promise<{ items: WorkTeamUsageRecord[]; total: number }> {
    const pool = getPool();
    const offset = (query.page - 1) * query.limit;

    const countResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .query(`
        SELECT COUNT(*) AS total
        FROM work_team_assignment_batch_teams bt
        INNER JOIN work_team_assignment_batches b
          ON b.id = bt.batch_id AND b.company_id = @companyId AND b.status = N'COMPLETED'
        WHERE bt.work_team_id = @workTeamId
      `);

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, query.limit)
      .query(`
        SELECT
          b.id AS batch_id,
          b.operation_id,
          o.notes AS operation_name,
          s.name AS service_name,
          o.operation_kind,
          o.status AS operation_status,
          b.requested_at,
          b.requested_by,
          u.name AS requested_by_name,
          b.valid_from,
          b.valid_until,
          (
            SELECT COUNT(*)
            FROM work_team_assignment_batch_items bi
            INNER JOIN work_team_assignment_batch_item_sources bis
              ON bis.batch_item_id = bi.id AND bis.work_team_id = @workTeamId
            WHERE bi.batch_id = b.id AND bi.result = N'ADDED'
          ) AS added_count,
          (
            SELECT COUNT(*)
            FROM work_team_assignment_batch_items bi
            LEFT JOIN work_team_assignment_batch_item_sources bis
              ON bis.batch_item_id = bi.id AND bis.work_team_id = @workTeamId
            WHERE bi.batch_id = b.id
              AND bi.result = N'SKIPPED'
              AND (bi.work_team_id = @workTeamId OR bis.work_team_id IS NOT NULL)
          ) AS skipped_count
        FROM work_team_assignment_batch_teams bt
        INNER JOIN work_team_assignment_batches b
          ON b.id = bt.batch_id AND b.company_id = @companyId AND b.status = N'COMPLETED'
        INNER JOIN scheduled_operations o ON o.id = b.operation_id AND o.company_id = @companyId
        INNER JOIN operational_locations s ON s.id = o.service_id AND s.company_id = @companyId
        LEFT JOIN users u ON u.id = b.requested_by
        WHERE bt.work_team_id = @workTeamId
        ORDER BY b.requested_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const batchIds = result.recordset.map((row) => String(row.batch_id));
    const skipReasonsByBatch = new Map<string, Array<{ reason: string; count: number }>>();

    if (batchIds.length > 0) {
      const reasonsRequest = pool.request().input("workTeamId", sql.UniqueIdentifier, workTeamId);
      const batchParams = batchIds.map((batchId, index) => {
        const param = `batchId${index}`;
        reasonsRequest.input(param, sql.UniqueIdentifier, batchId);
        return `@${param}`;
      });

      const reasonsResult = await reasonsRequest.query(`
        SELECT
          bi.batch_id,
          bi.reason,
          COUNT(*) AS reason_count
        FROM work_team_assignment_batch_items bi
        LEFT JOIN work_team_assignment_batch_item_sources bis
          ON bis.batch_item_id = bi.id AND bis.work_team_id = @workTeamId
        WHERE bi.batch_id IN (${batchParams.join(", ")})
          AND bi.result = N'SKIPPED'
          AND bi.reason IS NOT NULL
          AND (bi.work_team_id = @workTeamId OR bis.work_team_id IS NOT NULL)
        GROUP BY bi.batch_id, bi.reason
      `);

      for (const row of reasonsResult.recordset) {
        const batchId = String(row.batch_id);
        const list = skipReasonsByBatch.get(batchId) ?? [];
        list.push({
          reason: String(row.reason),
          count: Number(row.reason_count ?? 0),
        });
        skipReasonsByBatch.set(batchId, list);
      }
    }

    const items: WorkTeamUsageRecord[] = result.recordset.map((row) => {
      const batchId = String(row.batch_id);
      const topSkipReasons = (skipReasonsByBatch.get(batchId) ?? []).sort(
        (left, right) => right.count - left.count,
      );

      return {
        batchId,
        operationId: String(row.operation_id),
        operationName: row.operation_name ? String(row.operation_name) : null,
        serviceName: row.service_name ? String(row.service_name) : null,
        operationKind: String(row.operation_kind),
        operationStatus: String(row.operation_status),
        requestedAt: new Date(row.requested_at as Date | string).toISOString(),
        requestedBy: row.requested_by ? String(row.requested_by) : null,
        requestedByName: row.requested_by_name ? String(row.requested_by_name) : null,
        validFrom: row.valid_from ? toDateOnlyString(row.valid_from as Date | string) : null,
        validUntil: row.valid_until ? toDateOnlyString(row.valid_until as Date | string) : null,
        addedCount: Number(row.added_count ?? 0),
        skippedCount: Number(row.skipped_count ?? 0),
        topSkipReasons,
      };
    });

    return { items, total: Number(countResult.recordset[0]?.total ?? 0) };
  },
};
