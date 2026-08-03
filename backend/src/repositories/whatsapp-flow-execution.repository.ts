import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  WhatsappFlowExecutionStatus,
  WhatsappFlowStepStatus,
} from "../constants/whatsapp-observability";
import type {
  WhatsappFlowCandidate,
  WhatsappFlowExecution,
  WhatsappFlowStep,
} from "../types/whatsapp-observability";

const mapExecution = (row: Record<string, unknown>): WhatsappFlowExecution => ({
  id: String(row.id),
  conversationId: row.conversation_id ? String(row.conversation_id) : null,
  sourceMessageId: row.source_message_id ? String(row.source_message_id) : null,
  correlationId: String(row.correlation_id),
  causationId: row.causation_id ? String(row.causation_id) : null,
  sessionId: row.session_id ? String(row.session_id) : null,
  notificationId: row.notification_id ? String(row.notification_id) : null,
  companyId: row.company_id ? String(row.company_id) : null,
  employeeId: row.employee_id ? String(row.employee_id) : null,
  operationId: row.operation_id ? String(row.operation_id) : null,
  workdayId: row.workday_id ? String(row.workday_id) : null,
  attendanceId: row.attendance_id ? String(row.attendance_id) : null,
  flowType: String(row.flow_type),
  flowVersion: String(row.flow_version),
  status: String(row.status) as WhatsappFlowExecutionStatus,
  resultCode: row.result_code ? String(row.result_code) : null,
  startedAt: new Date(row.started_at as Date | string).toISOString(),
  finishedAt: row.finished_at
    ? new Date(row.finished_at as Date | string).toISOString()
    : null,
  durationMs: row.duration_ms === null || row.duration_ms === undefined
    ? null
    : Number(row.duration_ms),
  errorCode: row.error_code ? String(row.error_code) : null,
  errorMessage: row.error_message ? String(row.error_message) : null,
  metadataJson: row.metadata_json ? String(row.metadata_json) : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
});

const mapStep = (row: Record<string, unknown>): WhatsappFlowStep => ({
  id: String(row.id),
  flowExecutionId: String(row.flow_execution_id),
  sequence: Number(row.sequence),
  stepType: String(row.step_type),
  stepName: String(row.step_name),
  status: String(row.status) as WhatsappFlowStepStatus,
  reasonCode: row.reason_code ? String(row.reason_code) : null,
  inputSummaryJson: row.input_summary_json ? String(row.input_summary_json) : null,
  outputSummaryJson: row.output_summary_json ? String(row.output_summary_json) : null,
  durationMs:
    row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
  errorCode: row.error_code ? String(row.error_code) : null,
  errorMessage: row.error_message ? String(row.error_message) : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
});

const mapCandidate = (row: Record<string, unknown>): WhatsappFlowCandidate => ({
  id: String(row.id),
  flowExecutionId: String(row.flow_execution_id),
  candidateType: String(row.candidate_type),
  entityId: row.entity_id ? String(row.entity_id) : null,
  companyId: row.company_id ? String(row.company_id) : null,
  accepted: Boolean(row.accepted),
  reasonCode: row.reason_code ? String(row.reason_code) : null,
  reasonDetail: row.reason_detail ? String(row.reason_detail) : null,
  candidateSnapshotJson: row.candidate_snapshot_json
    ? String(row.candidate_snapshot_json)
    : null,
  sequence: Number(row.sequence),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
});

export const whatsappFlowExecutionRepository = {
  async create(input: {
    conversationId?: string | null;
    sourceMessageId?: string | null;
    correlationId: string;
    causationId?: string | null;
    sessionId?: string | null;
    notificationId?: string | null;
    companyId?: string | null;
    employeeId?: string | null;
    operationId?: string | null;
    workdayId?: string | null;
    attendanceId?: string | null;
    flowType: string;
    flowVersion?: string;
    status?: WhatsappFlowExecutionStatus;
    metadataJson?: string | null;
  }): Promise<WhatsappFlowExecution> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("conversationId", sql.UniqueIdentifier, input.conversationId ?? null)
      .input("sourceMessageId", sql.UniqueIdentifier, input.sourceMessageId ?? null)
      .input("correlationId", sql.UniqueIdentifier, input.correlationId)
      .input("causationId", sql.UniqueIdentifier, input.causationId ?? null)
      .input("sessionId", sql.UniqueIdentifier, input.sessionId ?? null)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId ?? null)
      .input("companyId", sql.UniqueIdentifier, input.companyId ?? null)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId ?? null)
      .input("operationId", sql.UniqueIdentifier, input.operationId ?? null)
      .input("workdayId", sql.UniqueIdentifier, input.workdayId ?? null)
      .input("attendanceId", sql.UniqueIdentifier, input.attendanceId ?? null)
      .input("flowType", sql.NVarChar(60), input.flowType)
      .input("flowVersion", sql.NVarChar(40), input.flowVersion ?? "1")
      .input("status", sql.NVarChar(30), input.status ?? "STARTED")
      .input("metadataJson", sql.NVarChar(sql.MAX), input.metadataJson ?? null)
      .query(`
        INSERT INTO whatsapp_flow_executions (
          conversation_id, source_message_id, correlation_id, causation_id,
          session_id, notification_id, company_id, employee_id, operation_id,
          workday_id, attendance_id, flow_type, flow_version, status, metadata_json
        )
        OUTPUT INSERTED.*
        VALUES (
          @conversationId, @sourceMessageId, @correlationId, @causationId,
          @sessionId, @notificationId, @companyId, @employeeId, @operationId,
          @workdayId, @attendanceId, @flowType, @flowVersion, @status, @metadataJson
        )
      `);

    return mapExecution(result.recordset[0] as Record<string, unknown>);
  },

  async complete(input: {
    id: string;
    status: WhatsappFlowExecutionStatus;
    resultCode?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    sessionId?: string | null;
    attendanceId?: string | null;
    operationId?: string | null;
    workdayId?: string | null;
    employeeId?: string | null;
    sourceMessageId?: string | null;
  }): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("status", sql.NVarChar(30), input.status)
      .input("resultCode", sql.NVarChar(80), input.resultCode ?? null)
      .input("errorCode", sql.NVarChar(80), input.errorCode ?? null)
      .input("errorMessage", sql.NVarChar(500), input.errorMessage ?? null)
      .input("sessionId", sql.UniqueIdentifier, input.sessionId ?? null)
      .input("attendanceId", sql.UniqueIdentifier, input.attendanceId ?? null)
      .input("operationId", sql.UniqueIdentifier, input.operationId ?? null)
      .input("workdayId", sql.UniqueIdentifier, input.workdayId ?? null)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId ?? null)
      .input("sourceMessageId", sql.UniqueIdentifier, input.sourceMessageId ?? null)
      .query(`
        UPDATE whatsapp_flow_executions
        SET status = @status,
            result_code = COALESCE(@resultCode, result_code),
            error_code = COALESCE(@errorCode, error_code),
            error_message = COALESCE(@errorMessage, error_message),
            session_id = COALESCE(@sessionId, session_id),
            attendance_id = COALESCE(@attendanceId, attendance_id),
            operation_id = COALESCE(@operationId, operation_id),
            workday_id = COALESCE(@workdayId, workday_id),
            employee_id = COALESCE(@employeeId, employee_id),
            source_message_id = COALESCE(@sourceMessageId, source_message_id),
            finished_at = SYSUTCDATETIME(),
            duration_ms = DATEDIFF(MILLISECOND, started_at, SYSUTCDATETIME())
        WHERE id = @id
      `);
  },

  async findById(id: string): Promise<WhatsappFlowExecution | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM whatsapp_flow_executions WHERE id = @id`);
    if (!result.recordset[0]) {
      return null;
    }
    return mapExecution(result.recordset[0] as Record<string, unknown>);
  },

  async listByConversation(conversationId: string): Promise<WhatsappFlowExecution[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("conversationId", sql.UniqueIdentifier, conversationId)
      .query(`
        SELECT *
        FROM whatsapp_flow_executions
        WHERE conversation_id = @conversationId
        ORDER BY started_at DESC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapExecution);
  },

  async insertSteps(
    steps: Array<{
      flowExecutionId: string;
      sequence: number;
      stepType: string;
      stepName: string;
      status: WhatsappFlowStepStatus;
      reasonCode?: string | null;
      inputSummaryJson?: string | null;
      outputSummaryJson?: string | null;
      durationMs?: number | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    }>,
  ): Promise<void> {
    if (steps.length === 0) {
      return;
    }
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const step of steps) {
        await new sql.Request(transaction)
          .input("flowExecutionId", sql.UniqueIdentifier, step.flowExecutionId)
          .input("sequence", sql.Int, step.sequence)
          .input("stepType", sql.NVarChar(60), step.stepType)
          .input("stepName", sql.NVarChar(120), step.stepName)
          .input("status", sql.NVarChar(20), step.status)
          .input("reasonCode", sql.NVarChar(80), step.reasonCode ?? null)
          .input("inputSummaryJson", sql.NVarChar(sql.MAX), step.inputSummaryJson ?? null)
          .input("outputSummaryJson", sql.NVarChar(sql.MAX), step.outputSummaryJson ?? null)
          .input("durationMs", sql.Int, step.durationMs ?? null)
          .input("errorCode", sql.NVarChar(80), step.errorCode ?? null)
          .input("errorMessage", sql.NVarChar(500), step.errorMessage ?? null)
          .query(`
            INSERT INTO whatsapp_flow_steps (
              flow_execution_id, sequence, step_type, step_name, status,
              reason_code, input_summary_json, output_summary_json,
              duration_ms, error_code, error_message
            )
            VALUES (
              @flowExecutionId, @sequence, @stepType, @stepName, @status,
              @reasonCode, @inputSummaryJson, @outputSummaryJson,
              @durationMs, @errorCode, @errorMessage
            )
          `);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async listSteps(flowExecutionId: string): Promise<WhatsappFlowStep[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("flowExecutionId", sql.UniqueIdentifier, flowExecutionId)
      .query(`
        SELECT *
        FROM whatsapp_flow_steps
        WHERE flow_execution_id = @flowExecutionId
        ORDER BY sequence ASC, created_at ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapStep);
  },

  async insertCandidates(
    candidates: Array<{
      flowExecutionId: string;
      candidateType: string;
      entityId?: string | null;
      companyId?: string | null;
      accepted: boolean;
      reasonCode?: string | null;
      reasonDetail?: string | null;
      candidateSnapshotJson?: string | null;
      sequence: number;
    }>,
  ): Promise<void> {
    if (candidates.length === 0) {
      return;
    }
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const candidate of candidates) {
        await new sql.Request(transaction)
          .input("flowExecutionId", sql.UniqueIdentifier, candidate.flowExecutionId)
          .input("candidateType", sql.NVarChar(60), candidate.candidateType)
          .input("entityId", sql.UniqueIdentifier, candidate.entityId ?? null)
          .input("companyId", sql.UniqueIdentifier, candidate.companyId ?? null)
          .input("accepted", sql.Bit, candidate.accepted ? 1 : 0)
          .input("reasonCode", sql.NVarChar(80), candidate.reasonCode ?? null)
          .input("reasonDetail", sql.NVarChar(500), candidate.reasonDetail ?? null)
          .input(
            "candidateSnapshotJson",
            sql.NVarChar(sql.MAX),
            candidate.candidateSnapshotJson ?? null,
          )
          .input("sequence", sql.Int, candidate.sequence)
          .query(`
            INSERT INTO whatsapp_flow_candidates (
              flow_execution_id, candidate_type, entity_id, company_id,
              accepted, reason_code, reason_detail, candidate_snapshot_json, sequence
            )
            VALUES (
              @flowExecutionId, @candidateType, @entityId, @companyId,
              @accepted, @reasonCode, @reasonDetail, @candidateSnapshotJson, @sequence
            )
          `);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async listCandidates(flowExecutionId: string): Promise<WhatsappFlowCandidate[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("flowExecutionId", sql.UniqueIdentifier, flowExecutionId)
      .query(`
        SELECT *
        FROM whatsapp_flow_candidates
        WHERE flow_execution_id = @flowExecutionId
        ORDER BY sequence ASC, created_at ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapCandidate);
  },
};
