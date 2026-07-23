import sql from "mssql";
import { getPool } from "../database/connection";
import type { ImportEntityType } from "../imports/constants";
import type {
  ImportJobStatus,
  PreparedImport,
} from "../imports/prepared-import";
import type { ImportExecuteResult } from "../imports/types";

export type ImportJobRecord = {
  id: string;
  companyId: string;
  userId: string | null;
  entityType: ImportEntityType;
  strategyVersion: string;
  fileName: string;
  fileHash: string;
  confirmationToken: string;
  idempotencyKey: string | null;
  status: ImportJobStatus;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  rejectedCount: number;
  preparedPlanJson: string | null;
  resultJson: string | null;
  generalError: string | null;
  expiresAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const mapRow = (row: Record<string, unknown>): ImportJobRecord => ({
  id: String(row.id),
  companyId: String(row.company_id),
  userId: row.user_id ? String(row.user_id) : null,
  entityType: String(row.entity_type) as ImportEntityType,
  strategyVersion: String(row.strategy_version),
  fileName: String(row.file_name),
  fileHash: String(row.file_hash),
  confirmationToken: String(row.confirmation_token),
  idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : null,
  status: String(row.status) as ImportJobStatus,
  totalRows: Number(row.total_rows),
  createdCount: Number(row.created_count),
  updatedCount: Number(row.updated_count),
  rejectedCount: Number(row.rejected_count),
  preparedPlanJson: row.prepared_plan_json ? String(row.prepared_plan_json) : null,
  resultJson: row.result_json ? String(row.result_json) : null,
  generalError: row.general_error ? String(row.general_error) : null,
  expiresAt: new Date(String(row.expires_at)),
  startedAt: row.started_at ? new Date(String(row.started_at)) : null,
  finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null,
  createdAt: new Date(String(row.created_at)),
  updatedAt: new Date(String(row.updated_at)),
});

export const importJobRepository = {
  async create(input: {
    companyId: string;
    userId: string | null;
    entityType: ImportEntityType;
    strategyVersion: string;
    fileName: string;
    fileHash: string;
    confirmationToken: string;
    idempotencyKey: string | null;
    status: ImportJobStatus;
    totalRows: number;
    prepared: PreparedImport;
    expiresAt: Date;
  }): Promise<ImportJobRecord> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("entityType", sql.NVarChar(40), input.entityType)
      .input("strategyVersion", sql.NVarChar(40), input.strategyVersion)
      .input("fileName", sql.NVarChar(255), input.fileName)
      .input("fileHash", sql.Char(64), input.fileHash)
      .input("confirmationToken", sql.UniqueIdentifier, input.confirmationToken)
      .input("idempotencyKey", sql.NVarChar(128), input.idempotencyKey)
      .input("status", sql.NVarChar(20), input.status)
      .input("totalRows", sql.Int, input.totalRows)
      .input("preparedPlanJson", sql.NVarChar(sql.MAX), JSON.stringify(input.prepared))
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .query(`
        INSERT INTO import_jobs (
          company_id, user_id, entity_type, strategy_version, file_name, file_hash,
          confirmation_token, idempotency_key, status, total_rows, prepared_plan_json, expires_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @userId, @entityType, @strategyVersion, @fileName, @fileHash,
          @confirmationToken, @idempotencyKey, @status, @totalRows, @preparedPlanJson, @expiresAt
        )
      `);

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, id: string): Promise<ImportJobRecord | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT *
        FROM import_jobs
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByConfirmationToken(
    companyId: string,
    confirmationToken: string,
  ): Promise<ImportJobRecord | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("confirmationToken", sql.UniqueIdentifier, confirmationToken)
      .query(`
        SELECT *
        FROM import_jobs
        WHERE company_id = @companyId
          AND confirmation_token = @confirmationToken
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByIdempotencyKey(
    companyId: string,
    entityType: ImportEntityType,
    idempotencyKey: string,
  ): Promise<ImportJobRecord | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityType", sql.NVarChar(40), entityType)
      .input("idempotencyKey", sql.NVarChar(128), idempotencyKey)
      .query(`
        SELECT TOP 1 *
        FROM import_jobs
        WHERE company_id = @companyId
          AND entity_type = @entityType
          AND idempotency_key = @idempotencyKey
        ORDER BY created_at DESC
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async tryClaimProcessing(companyId: string, id: string): Promise<ImportJobRecord | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE import_jobs
        SET status = N'PROCESSING',
            started_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'READY'
          AND expires_at > SYSUTCDATETIME()
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async markFinished(
    companyId: string,
    id: string,
    input: {
      status: "COMPLETED" | "PARTIAL" | "FAILED";
      createdCount: number;
      updatedCount: number;
      rejectedCount: number;
      result: ImportExecuteResult;
      generalError?: string | null;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .input("status", sql.NVarChar(20), input.status)
      .input("createdCount", sql.Int, input.createdCount)
      .input("updatedCount", sql.Int, input.updatedCount)
      .input("rejectedCount", sql.Int, input.rejectedCount)
      .input("resultJson", sql.NVarChar(sql.MAX), JSON.stringify(input.result))
      .input("generalError", sql.NVarChar(1000), input.generalError ?? null)
      .query(`
        UPDATE import_jobs
        SET status = @status,
            created_count = @createdCount,
            updated_count = @updatedCount,
            rejected_count = @rejectedCount,
            result_json = @resultJson,
            general_error = @generalError,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markFailed(companyId: string, id: string, generalError: string): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .input("generalError", sql.NVarChar(1000), generalError.slice(0, 1000))
      .query(`
        UPDATE import_jobs
        SET status = N'FAILED',
            general_error = @generalError,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  parsePreparedPlan(job: ImportJobRecord): PreparedImport {
    if (!job.preparedPlanJson) {
      throw new Error("IMPORT_JOB_MISSING_PLAN");
    }
    return JSON.parse(job.preparedPlanJson) as PreparedImport;
  },

  parseResult(job: ImportJobRecord): ImportExecuteResult | null {
    if (!job.resultJson) {
      return null;
    }
    return JSON.parse(job.resultJson) as ImportExecuteResult;
  },
};
