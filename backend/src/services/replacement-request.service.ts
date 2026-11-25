import { randomUUID } from "node:crypto";
import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { operationCoverageEventRepository } from "../repositories/operations/operation-coverage-event.repository";
import { individualRecommendationService } from "./recommendation/individual-recommendation.service";
import { employeeAvailabilityService } from "./employees/employee-availability.service";
import { operationEmployeeRepository } from "../repositories/operations/operation-employee.repository";
import { employeeWorkdayRepository } from "../repositories/workdays/employee-workday.repository";
import { auditService } from "./audit.service";
import { toDateOnlyString } from "../utils/row-mappers";
import {
  isAbsentWorkdayVacancyActive,
  isReplacementRequestContinuable,
  isReplacementRequestTerminalForRetry,
} from "../utils/replacement/replacement-vacancy-state";
import { formatReplacementAssignmentConfirmation } from "../utils/replacement/replacement-confirmation-message";
import { companySettingsRepository } from "../repositories/companies/company-settings.repository";
import {
  materializeReplacementVacancyNotifications,
  type ReplacementNotificationContext,
} from "./replacement/replacement-request-notifications";
import {
  acquireTransactionAppLock,
  replacementCandidateLockResource,
  replacementVacancyLockResource,
} from "../utils/sql-app-lock";

type ReplacementContext = {
  requestId: string;
  operationWorkdayId: string;
  operationId: string;
  operationKind: string;
  workDate: string;
  operationShiftId: string | null;
  expectedStartAt: string;
  expectedEndAt: string | null;
  absentEmployeeId: string;
  absentName: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  status: string;
  candidatesMaterializedAt: string | null;
  notificationsMaterializedAt: string | null;
  requestVersion: number;
  absenceRequestId: string | null;
  candidatesMaterializationError: string | null;
};

export type CreateReplacementVacancyInput = {
  companyId: string;
  employeeWorkdayId: string;
  employeeId: string;
  absenceRequestId?: string | null;
  trigger?: "UNAVAILABILITY" | "ABSENCE_APPROVED";
};

const staleReply = "⚠️ Esta opción ya no está disponible. La situación del turno cambió.";
const coveredReply = "Esta ausencia ya fue cubierta.";

const buildCoverageConfirmation = async (
  companyId: string,
  row: Record<string, unknown>,
): Promise<string> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = settings?.operationTimezone ?? "America/Argentina/Buenos_Aires";
  return formatReplacementAssignmentConfirmation({
    candidateName: String(row.candidate_name),
    serviceName: String(row.service_name),
    workDate: toDateOnlyString(row.work_date as Date | string),
    expectedStartAt: String(row.expected_start_at),
    timezone,
  });
};

const acquireVacancyCoverageLock = async (
  transaction: sql.Transaction,
  companyId: string,
  employeeWorkdayId: string,
): Promise<void> => {
  await acquireTransactionAppLock(transaction, {
    resource: replacementVacancyLockResource(companyId, employeeWorkdayId),
    lockTimeoutMs: 10000,
    timeoutError: new AppError(
      409,
      "REPLACEMENT_VACANCY_LOCK_FAILED",
      "No se pudo bloquear la vacante de reemplazo",
    ),
  });
};

const toContext = (row: Record<string, unknown>): ReplacementContext => ({
  requestId: String(row.request_id),
  operationWorkdayId: String(row.operation_workday_id),
  operationId: String(row.operation_id),
  operationKind: String(row.operation_kind),
  workDate: toDateOnlyString(row.work_date as Date | string),
  operationShiftId: row.operation_shift_id ? String(row.operation_shift_id) : null,
  expectedStartAt: String(row.expected_start_at),
  expectedEndAt: row.expected_end_at ? String(row.expected_end_at) : null,
  absentEmployeeId: String(row.absent_employee_id),
  absentName: String(row.absent_name),
  serviceName: String(row.service_name),
  serviceAddress: row.service_address ? String(row.service_address) : null,
  serviceLocality: row.service_locality ? String(row.service_locality) : null,
  status: String(row.status),
  candidatesMaterializedAt: row.candidates_materialized_at
    ? String(row.candidates_materialized_at)
    : null,
  notificationsMaterializedAt: row.notifications_materialized_at
    ? String(row.notifications_materialized_at)
    : null,
  requestVersion: Number(row.request_version ?? 1),
  absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
  candidatesMaterializationError: row.candidates_materialization_error
    ? String(row.candidates_materialization_error)
    : null,
});

const requestContextSql = `
  SELECT rr.id request_id, rr.status, rr.request_version, rr.absence_request_id,
    rr.candidates_materialized_at, rr.notifications_materialized_at,
    rr.candidates_materialization_error,
    ow.id operation_workday_id, ow.operation_id, o.operation_kind, ow.work_date, ow.operation_shift_id,
    ow.expected_start_at, ow.expected_end_at, rr.absent_employee_id, e.name absent_name, s.name service_name,
    s.address service_address, s.locality service_locality
  FROM replacement_requests rr
  JOIN operation_workdays ow ON ow.id=rr.operation_workday_id AND ow.company_id=rr.company_id
  JOIN scheduled_operations o ON o.id=ow.operation_id AND o.company_id=ow.company_id
  JOIN operational_locations s ON s.id=o.service_id AND s.company_id=o.company_id
  JOIN employees e ON e.id=rr.absent_employee_id AND e.company_id=rr.company_id
  WHERE rr.company_id=@companyId AND rr.id=@requestId
`;

const resolveActiveCoverageForWorkday = async (
  companyId: string,
  employeeWorkdayId: string,
  transaction?: sql.Transaction,
): Promise<boolean> => {
  const req = transaction ? new sql.Request(transaction) : getPool().request();
  const coverage = await req
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
    .query(`
      SELECT TOP 1 1 AS active
      FROM operation_coverage_events
      WHERE company_id = @companyId
        AND absent_employee_workday_id = @employeeWorkdayId
        AND superseded_at IS NULL
    `);
  return Boolean(coverage.recordset[0]);
};

const loadRequestContext = async (
  companyId: string,
  requestId: string,
  transaction?: sql.Transaction,
): Promise<ReplacementContext> => {
  const req = transaction ? new sql.Request(transaction) : getPool().request();
  const context = await req
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, requestId)
    .query(requestContextSql);
  const row = context.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new AppError(404, "REPLACEMENT_REQUEST_NOT_FOUND", "Solicitud de reemplazo no encontrada");
  }
  return toContext(row);
};

const findOrCreateRequest = async (input: CreateReplacementVacancyInput): Promise<ReplacementContext> => {
  const tx = new sql.Transaction(getPool());
  await tx.begin();
  try {
    const source = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .query(`
        SELECT ew.id, ew.unavailable_at, ew.expectation_status, ew.absence_request_id,
          ow.id operation_workday_id, ow.status workday_status
        FROM employee_workdays ew WITH (UPDLOCK,HOLDLOCK)
        JOIN operation_workdays ow ON ow.id=ew.operation_workday_id AND ow.company_id=ew.company_id
        WHERE ew.company_id=@companyId AND ew.id=@employeeWorkdayId AND ew.employee_id=@employeeId
      `);
    const sourceRow = source.recordset[0] as Record<string, unknown> | undefined;
    if (!sourceRow || String(sourceRow.workday_status) !== "ACTIVE") {
      throw new AppError(409, "REPLACEMENT_WORKDAY_INVALID", "La jornada ya no está disponible");
    }
    const hasActiveCoverage = await resolveActiveCoverageForWorkday(
      input.companyId,
      input.employeeWorkdayId,
      tx,
    );
    const vacancyActive = isAbsentWorkdayVacancyActive({
      workdayStatus: String(sourceRow.workday_status),
      expectationStatus: String(sourceRow.expectation_status),
      unavailableAt: sourceRow.unavailable_at ? String(sourceRow.unavailable_at) : null,
      absenceRequestId: sourceRow.absence_request_id ? String(sourceRow.absence_request_id) : null,
      hasActiveCoverage,
    });
    if (!vacancyActive) {
      throw new AppError(409, "REPLACEMENT_VACANCY_INACTIVE", "La vacante ya no requiere cobertura");
    }

    const continuable = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .query(`
        SELECT TOP 1 id, status, candidates_materialization_error
        FROM replacement_requests WITH (UPDLOCK,HOLDLOCK)
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @employeeWorkdayId
          AND status IN (N'PENDING', N'FAILED')
        ORDER BY created_at DESC
      `);
    const continuableRow = continuable.recordset[0] as Record<string, unknown> | undefined;

    const terminal = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .query(`
        SELECT TOP 1 id, status
        FROM replacement_requests WITH (UPDLOCK,HOLDLOCK)
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @employeeWorkdayId
        ORDER BY created_at DESC
      `);
    const terminalRow = terminal.recordset[0] as Record<string, unknown> | undefined;
    const latestStatus = terminalRow ? String(terminalRow.status) : null;

    let requestId: string | null = null;

    if (continuableRow && isReplacementRequestContinuable(String(continuableRow.status))) {
      requestId = String(continuableRow.id);
      if (
        String(continuableRow.status) === "FAILED" &&
        continuableRow.candidates_materialization_error
      ) {
        await new sql.Request(tx)
          .input("companyId", sql.UniqueIdentifier, input.companyId)
          .input("requestId", sql.UniqueIdentifier, requestId)
          .query(`
            UPDATE replacement_requests
            SET status = N'PENDING',
                candidates_materialization_error = NULL,
                candidates_materialized_at = NULL,
                updated_at = SYSUTCDATETIME()
            WHERE company_id = @companyId AND id = @requestId
              AND status = N'FAILED'
              AND candidates_materialization_error IS NOT NULL
          `);
      }
    } else if (terminalRow && isReplacementRequestTerminalForRetry(latestStatus ?? "")) {
      await tx.commit();
      return loadRequestContext(input.companyId, String(terminalRow.id));
    }

    if (!requestId) {
      const parent = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("operationWorkdayId", sql.UniqueIdentifier, String(sourceRow.operation_workday_id))
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .query(`SELECT TOP 1 id, COALESCE(root_request_id,id) root_request_id
          FROM replacement_requests WITH (UPDLOCK,HOLDLOCK)
          WHERE company_id=@companyId AND operation_workday_id=@operationWorkdayId
            AND resolved_employee_id=@employeeId AND status=N'COVERED'
          ORDER BY resolved_at DESC`);
      const parentRow = parent.recordset[0] as Record<string, unknown> | undefined;
      const created = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("operationWorkdayId", sql.UniqueIdentifier, String(sourceRow.operation_workday_id))
        .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("parentId", sql.UniqueIdentifier, parentRow ? String(parentRow.id) : null)
        .input("rootId", sql.UniqueIdentifier, parentRow ? String(parentRow.root_request_id) : null)
        .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId ?? null)
        .query(`INSERT replacement_requests(
          company_id,operation_workday_id,absent_employee_workday_id,absent_employee_id,
          parent_request_id,root_request_id,absence_request_id)
          OUTPUT INSERTED.id
          VALUES(@companyId,@operationWorkdayId,@employeeWorkdayId,@employeeId,@parentId,@rootId,@absenceRequestId)`);
      requestId = String((created.recordset[0] as Record<string, unknown>).id);
      if (!parentRow) {
        await new sql.Request(tx).input("requestId", sql.UniqueIdentifier, requestId)
          .query(`UPDATE replacement_requests SET root_request_id=@requestId WHERE id=@requestId`);
      }
      await auditService.log(input.companyId, {
        action: "REPLACEMENT_REQUEST_CREATED",
        entityType: "replacement_request",
        entityId: requestId,
        newData: { employeeWorkdayId: input.employeeWorkdayId },
      }, tx);
    }

    if (!requestId) {
      throw new AppError(500, "REPLACEMENT_REQUEST_UNRESOLVED", "No se pudo resolver la solicitud de reemplazo");
    }

    if (requestId && input.absenceRequestId) {
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("requestId", sql.UniqueIdentifier, requestId)
        .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
        .query(`
          UPDATE replacement_requests
          SET absence_request_id = COALESCE(absence_request_id, @absenceRequestId),
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId AND id = @requestId
        `);
    }

    const context = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("requestId", sql.UniqueIdentifier, requestId)
      .query(requestContextSql);
    await tx.commit();
    return toContext(context.recordset[0] as Record<string, unknown>);
  } catch (error) {
    try { await tx.rollback(); } catch { /* transaction was not started or already settled */ }
    throw error;
  }
};

const persistCandidateMaterializationFailure = async (
  companyId: string,
  requestId: string,
  error: unknown,
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error);
  await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, requestId)
    .input("message", sql.NVarChar(500), message.slice(0, 500))
    .query(`
      UPDATE replacement_requests
      SET status = N'FAILED',
          candidates_materialized_at = SYSUTCDATETIME(),
          candidates_materialization_error = @message,
          updated_at = SYSUTCDATETIME()
      WHERE company_id = @companyId AND id = @requestId AND status = N'PENDING'
        AND candidates_materialized_at IS NULL
    `);
};

const materializeCandidates = async (
  companyId: string,
  context: ReplacementContext,
): Promise<ReplacementContext> => {
  if (
    context.status !== "PENDING" ||
    (context.candidatesMaterializedAt && !context.candidatesMaterializationError)
  ) {
    return context;
  }

  // The recommender is read-only and deliberately runs outside a write transaction.
  const recommendation = await individualRecommendationService.recommendEmployees(
    companyId, context.operationId, 20,
    context.operationKind === "RECURRING" ? context.workDate : undefined,
  );
  const exclusionRows = await getPool().request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, context.requestId)
    .query(`WITH chain AS (
      SELECT id,parent_request_id,absent_employee_id FROM replacement_requests
      WHERE company_id=@companyId AND id=@requestId
      UNION ALL
      SELECT rr.id,rr.parent_request_id,rr.absent_employee_id FROM replacement_requests rr
      JOIN chain c ON c.parent_request_id=rr.id AND rr.company_id=@companyId
    ) SELECT absent_employee_id FROM chain`);
  const excluded = new Set(exclusionRows.recordset.map((row: Record<string, unknown>) => String(row.absent_employee_id)));
  const eligible: typeof recommendation.recommendations = [];
  const seen = new Set<string>();
  for (const candidate of recommendation.recommendations) {
    if (candidate.employee.id === context.absentEmployeeId) continue;
    if (excluded.has(candidate.employee.id)) continue;
    if (seen.has(candidate.employee.id)) continue;
    const availability = await employeeAvailabilityService.getAvailabilityForInterval({
      companyId,
      employeeId: candidate.employee.id,
      startAt: new Date(context.expectedStartAt),
      endAt: context.expectedEndAt ? new Date(context.expectedEndAt) : new Date(context.expectedStartAt),
    });
    if (availability.status === "AVAILABLE") {
      eligible.push(candidate);
      seen.add(candidate.employee.id);
    }
    if (eligible.length === 3) break;
  }

  const tx = new sql.Transaction(getPool());
  await tx.begin();
  try {
    const locked = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .query(`SELECT status,request_version,candidates_materialized_at,candidates_materialization_error
        FROM replacement_requests WITH (UPDLOCK,HOLDLOCK)
        WHERE company_id=@companyId AND id=@requestId`);
    const row = locked.recordset[0] as Record<string, unknown> | undefined;
    if (
      !row ||
      String(row.status) !== "PENDING" ||
      (row.candidates_materialized_at && !row.candidates_materialization_error)
    ) {
      await tx.commit();
      return loadRequestContext(companyId, context.requestId);
    }

    await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .input("offerVersion", sql.Int, Number(row.request_version ?? context.requestVersion))
      .query(`
        UPDATE replacement_request_candidates
        SET status = N'STALE', updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND request_id = @requestId
          AND status = N'OFFERED' AND offer_version <> @offerVersion
      `);

    const offerVersion = Number(row.request_version ?? context.requestVersion);
    for (const [index, candidate] of eligible.entries()) {
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("requestId", sql.UniqueIdentifier, context.requestId)
        .input("employeeId", sql.UniqueIdentifier, candidate.employee.id)
        .input("rank", sql.Int, index + 1)
        .input("offerVersion", sql.Int, offerVersion)
        .input("score", sql.Decimal(9, 6), candidate.score)
        .input("reasons", sql.NVarChar(sql.MAX), JSON.stringify(candidate.reasons))
        .query(`INSERT replacement_request_candidates(
          company_id,request_id,employee_id,rank,offer_version,score,reasons_json)
          VALUES(@companyId,@requestId,@employeeId,@rank,@offerVersion,@score,@reasons)`);
    }
    await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .input("candidateCount", sql.Int, eligible.length)
      .query(`UPDATE replacement_requests
        SET candidates_materialized_at=SYSUTCDATETIME(),
          status=CASE WHEN @candidateCount=0 THEN N'FAILED' ELSE status END,
          updated_at=SYSUTCDATETIME()
        WHERE company_id=@companyId AND id=@requestId`);
    await auditService.log(companyId, {
      action: "REPLACEMENT_RECOMMENDATIONS_CREATED",
      entityType: "replacement_request",
      entityId: context.requestId,
      newData: { candidateCount: eligible.length },
    }, tx);
    await tx.commit();
    return { ...context, candidatesMaterializedAt: new Date().toISOString(), status: eligible.length ? "PENDING" : "FAILED" };
  } catch (error) {
    try { await tx.rollback(); } catch { /* transaction was not started or already settled */ }
    throw error;
  }
};

const toNotificationContext = (
  input: CreateReplacementVacancyInput,
  context: ReplacementContext,
): ReplacementNotificationContext => ({
  companyId: input.companyId,
  requestId: context.requestId,
  requestVersion: context.requestVersion,
  operationId: context.operationId,
  employeeWorkdayId: input.employeeWorkdayId,
  absentEmployeeId: input.employeeId,
  absentName: context.absentName,
  serviceName: context.serviceName,
  serviceAddress: context.serviceAddress,
  serviceLocality: context.serviceLocality,
  workDate: context.workDate,
  expectedStartAt: context.expectedStartAt,
  expectedEndAt: context.expectedEndAt,
  absenceRequestId: input.absenceRequestId ?? context.absenceRequestId,
});

const ensureVacancyNotifications = async (
  input: CreateReplacementVacancyInput,
  context: ReplacementContext,
): Promise<void> => {
    const ranked = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .input("offerVersion", sql.Int, context.requestVersion)
      .query(`
        SELECT rank FROM replacement_request_candidates
        WHERE company_id = @companyId AND request_id = @requestId
          AND offer_version = @offerVersion AND status = N'OFFERED'
        ORDER BY rank
      `);
    const candidateRanks = ranked.recordset.map((row: Record<string, unknown>) => Number(row.rank));
    await materializeReplacementVacancyNotifications(
      toNotificationContext(input, context),
      candidateRanks,
    );
};

export const replacementRequestService = {
  async createForEligibleVacancy(input: CreateReplacementVacancyInput): Promise<void> {
    let context: ReplacementContext;
    try {
      context = await findOrCreateRequest(input);
    } catch (error) {
      if (error instanceof AppError && error.code === "REPLACEMENT_VACANCY_INACTIVE") {
        return;
      }
      throw error;
    }
    if (context.status === "COVERED" || context.status === "EXPIRED") {
      return;
    }
    try {
      context = await materializeCandidates(input.companyId, context);
    } catch (error) {
      await persistCandidateMaterializationFailure(input.companyId, context.requestId, error);
      context = await loadRequestContext(input.companyId, context.requestId);
    }
    if (!context.candidatesMaterializedAt) {
      return;
    }
    if (context.notificationsMaterializedAt) {
      return;
    }
    await ensureVacancyNotifications(input, context);
  },

  async ensureVacancyNotificationsForWorkday(input: CreateReplacementVacancyInput): Promise<void> {
    const hasActiveCoverage = await resolveActiveCoverageForWorkday(
      input.companyId,
      input.employeeWorkdayId,
    );
    if (hasActiveCoverage) {
      return;
    }
    const source = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .query(`
        SELECT ew.expectation_status, ew.unavailable_at, ew.absence_request_id, ow.status workday_status
        FROM employee_workdays ew
        JOIN operation_workdays ow ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
        WHERE ew.company_id = @companyId AND ew.id = @employeeWorkdayId AND ew.employee_id = @employeeId
      `);
    const sourceRow = source.recordset[0] as Record<string, unknown> | undefined;
    if (
      !sourceRow ||
      !isAbsentWorkdayVacancyActive({
        workdayStatus: String(sourceRow.workday_status),
        expectationStatus: String(sourceRow.expectation_status),
        unavailableAt: sourceRow.unavailable_at ? String(sourceRow.unavailable_at) : null,
        absenceRequestId: sourceRow.absence_request_id ? String(sourceRow.absence_request_id) : null,
        hasActiveCoverage,
      })
    ) {
      return;
    }

    const lookup = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .query(`
        SELECT TOP 1 id FROM replacement_requests
        WHERE company_id = @companyId AND absent_employee_workday_id = @employeeWorkdayId
          AND status IN (N'PENDING', N'FAILED')
        ORDER BY created_at DESC
      `);
    const requestId = lookup.recordset[0]
      ? String((lookup.recordset[0] as Record<string, unknown>).id)
      : null;
    if (!requestId) {
      await this.createForEligibleVacancy(input);
      return;
    }
    const context = await loadRequestContext(input.companyId, requestId);
    if (!context.candidatesMaterializedAt) {
      await this.createForEligibleVacancy(input);
      return;
    }
    if (context.notificationsMaterializedAt) {
      return;
    }
    await ensureVacancyNotifications(input, context);
  },

  /** @deprecated Use createForEligibleVacancy */
  async createForUnavailable(input: {
    companyId: string;
    employeeWorkdayId: string;
    employeeId: string;
  }): Promise<void> {
    await this.createForEligibleVacancy({ ...input, trigger: "UNAVAILABILITY" });
  },

  async handleQuickReply(
    companyId: string,
    phone: string,
    payload: string,
    originalRepliedMessageSid: string | null,
  ): Promise<string | null> {
    const match = /^replacement_option_([1-3])$/.exec(payload.trim());
    if (!match) return null;
    if (!originalRepliedMessageSid) return staleReply;

    const tx = new sql.Transaction(getPool());
    await tx.begin();
    try {
      const prelude = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("phone", sql.NVarChar(20), phone)
        .input("originalMessageSid", sql.NVarChar(100), originalRepliedMessageSid)
        .query(`
          SELECT TOP 1 rr.absent_employee_workday_id
          FROM replacement_request_notifications rn
          JOIN company_alert_recipients ar ON ar.id=rn.recipient_id AND ar.company_id=rn.company_id
          JOIN whatsapp_admin_alert_notifications an ON an.id=rn.notification_id AND an.company_id=rn.company_id
          JOIN replacement_requests rr ON rr.id=rn.request_id AND rr.company_id=rn.company_id
          WHERE rn.company_id=@companyId AND ar.phone_number=@phone AND ar.is_enabled = 1
            AND ar.receive_operational_alerts = 1
            AND an.provider_message_sid=@originalMessageSid
        `);
      const preludeRow = prelude.recordset[0] as Record<string, unknown> | undefined;
      if (!preludeRow?.absent_employee_workday_id) {
        await tx.commit();
        return staleReply;
      }
      const employeeWorkdayId = String(preludeRow.absent_employee_workday_id);
      await acquireVacancyCoverageLock(tx, companyId, employeeWorkdayId);

      const data = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("phone", sql.NVarChar(20), phone)
        .input("originalMessageSid", sql.NVarChar(100), originalRepliedMessageSid)
        .input("rank", sql.Int, Number(match[1]))
        .query(`SELECT rr.id request_id,rr.status request_status,rr.request_version,rr.absent_employee_workday_id,
          rr.absent_employee_id,
          rc.id candidate_id,rc.employee_id candidate_employee_id,rc.status candidate_status,
          ow.id operation_workday_id,ow.work_date,ow.operation_id,ow.operation_shift_id,
          ow.expected_start_at,ow.expected_end_at,ow.status workday_status,
          e.name candidate_name,s.name service_name,absent.unavailable_at,
          absent.expectation_status absent_expectation_status,absent.absence_request_id,
          absent.operation_assignment_id absent_assignment_id
          FROM replacement_request_notifications rn
          JOIN company_alert_recipients ar ON ar.id=rn.recipient_id AND ar.company_id=rn.company_id
          JOIN whatsapp_admin_alert_notifications an ON an.id=rn.notification_id AND an.company_id=rn.company_id
          JOIN replacement_requests rr WITH (UPDLOCK,HOLDLOCK) ON rr.id=rn.request_id AND rr.company_id=rn.company_id
          JOIN replacement_request_candidates rc WITH (UPDLOCK,HOLDLOCK)
            ON rc.request_id=rr.id AND rc.company_id=rr.company_id AND rc.rank=@rank
            AND rc.offer_version = rn.request_version
          JOIN operation_workdays ow WITH (UPDLOCK,HOLDLOCK) ON ow.id=rr.operation_workday_id AND ow.company_id=rr.company_id
          JOIN employees e ON e.id=rc.employee_id AND e.company_id=rr.company_id
          JOIN scheduled_operations o ON o.id=ow.operation_id AND o.company_id=ow.company_id
          JOIN operational_locations s ON s.id=o.service_id AND s.company_id=o.company_id
          JOIN employee_workdays absent WITH (UPDLOCK,HOLDLOCK) ON absent.id=rr.absent_employee_workday_id AND absent.company_id=rr.company_id
          WHERE rn.company_id=@companyId AND ar.phone_number=@phone AND ar.is_enabled = 1
            AND ar.receive_operational_alerts = 1
            AND an.provider_message_sid=@originalMessageSid`);
      const row = data.recordset[0] as Record<string, unknown> | undefined;
      if (!row) { await tx.commit(); return staleReply; }
      if (String(row.request_status) === "COVERED") {
        await tx.commit();
        if (String(row.candidate_status) === "SELECTED") {
          return await buildCoverageConfirmation(companyId, row);
        }
        return coveredReply;
      }
      if (String(row.request_status) !== "PENDING") {
        await tx.commit();
        return staleReply;
      }
      if (String(row.candidate_status) === "SELECTED") {
        await tx.commit();
        return await buildCoverageConfirmation(companyId, row);
      }
      if (String(row.candidate_status) !== "OFFERED") {
        await tx.commit();
        return staleReply;
      }
      const hasActiveCoverage = await resolveActiveCoverageForWorkday(
        companyId,
        String(row.absent_employee_workday_id),
        tx,
      );
      const vacancyActive = isAbsentWorkdayVacancyActive({
        workdayStatus: String(row.workday_status),
        expectationStatus: String(row.absent_expectation_status),
        unavailableAt: row.unavailable_at ? String(row.unavailable_at) : null,
        absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
        hasActiveCoverage,
      });
      if (!vacancyActive) {
        await new sql.Request(tx).input("companyId", sql.UniqueIdentifier, companyId)
          .input("requestId", sql.UniqueIdentifier, String(row.request_id))
          .query(`UPDATE replacement_request_candidates SET status=N'STALE',updated_at=SYSUTCDATETIME()
            WHERE company_id=@companyId AND request_id=@requestId AND status=N'OFFERED';
            UPDATE replacement_requests SET status=N'EXPIRED',updated_at=SYSUTCDATETIME()
            WHERE company_id=@companyId AND id=@requestId AND status=N'PENDING'`);
        await auditService.log(companyId, { action: "REPLACEMENT_REQUEST_EXPIRED", entityType: "replacement_request", entityId: String(row.request_id), newData: {} }, tx);
        await tx.commit();
        return staleReply;
      }

      await acquireTransactionAppLock(tx, {
        resource: replacementCandidateLockResource(companyId, String(row.candidate_employee_id)),
        lockTimeoutMs: 10000,
        timeoutError: new AppError(
          409,
          "REPLACEMENT_CANDIDATE_LOCK_FAILED",
          "No se pudo bloquear al candidato de reemplazo",
        ),
      });

      const conflict = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, String(row.candidate_employee_id))
        .input("operationWorkdayId", sql.UniqueIdentifier, String(row.operation_workday_id))
        .input("startAt", sql.DateTime2, new Date(String(row.expected_start_at)))
        .input("endAt", sql.DateTime2, row.expected_end_at ? new Date(String(row.expected_end_at)) : new Date(String(row.expected_start_at)))
        .query(`SELECT TOP 1 ew.id FROM employee_workdays ew WITH (UPDLOCK,HOLDLOCK)
          JOIN operation_workdays ow ON ow.id=ew.operation_workday_id AND ow.company_id=ew.company_id
          WHERE ew.company_id=@companyId AND ew.employee_id=@employeeId AND ew.expectation_status=N'EXPECTED'
            AND ow.status=N'ACTIVE' AND ow.id<>@operationWorkdayId
            AND ow.expected_start_at < @endAt AND COALESCE(ow.expected_end_at,ow.expected_start_at)>@startAt`);
      if (conflict.recordset[0]) {
        await new sql.Request(tx).input("candidateId", sql.UniqueIdentifier, String(row.candidate_id))
          .query(`UPDATE replacement_request_candidates SET status=N'STALE',updated_at=SYSUTCDATETIME()
            WHERE id=@candidateId AND status=N'OFFERED'`);
        await auditService.log(companyId, { action: "REPLACEMENT_SELECTION_REJECTED", entityType: "replacement_request", entityId: String(row.request_id), newData: { reason: "OVERLAP" } }, tx);
        await tx.commit();
        return staleReply;
      }

      const alreadyOnWorkday = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, String(row.candidate_employee_id))
        .input("operationWorkdayId", sql.UniqueIdentifier, String(row.operation_workday_id))
        .query(`
          SELECT TOP 1 id FROM employee_workdays WITH (UPDLOCK,HOLDLOCK)
          WHERE company_id = @companyId AND employee_id = @employeeId
            AND operation_workday_id = @operationWorkdayId
            AND expectation_status IN (N'EXPECTED', N'JUSTIFIED')
        `);
      if (alreadyOnWorkday.recordset[0]) {
        await tx.commit();
        return await buildCoverageConfirmation(companyId, row);
      }

      const availability = await employeeAvailabilityService.getAvailabilityForInterval({
        companyId, employeeId: String(row.candidate_employee_id),
        startAt: new Date(String(row.expected_start_at)),
        endAt: row.expected_end_at ? new Date(String(row.expected_end_at)) : new Date(String(row.expected_start_at)),
      });
      if (availability.status !== "AVAILABLE") {
        await new sql.Request(tx).input("candidateId", sql.UniqueIdentifier, String(row.candidate_id))
          .query(`UPDATE replacement_request_candidates SET status=N'STALE',updated_at=SYSUTCDATETIME()
            WHERE id=@candidateId AND status=N'OFFERED'`);
        await auditService.log(companyId, { action: "REPLACEMENT_SELECTION_REJECTED", entityType: "replacement_request", entityId: String(row.request_id), newData: { reason: "UNAVAILABLE" } }, tx);
        await tx.commit();
        return staleReply;
      }

      const workDate = toDateOnlyString(row.work_date as Date | string);
      const assignment = await operationEmployeeRepository.createInTransaction(companyId, tx, {
        operationId: String(row.operation_id), employeeId: String(row.candidate_employee_id),
        validFrom: workDate, validUntil: workDate,
        assignmentOrigin: "COVERAGE", operationShiftId: row.operation_shift_id ? String(row.operation_shift_id) : null,
      });
      if (String(row.absent_expectation_status) === "EXPECTED") {
        const cancelled = await new sql.Request(tx)
          .input("companyId", sql.UniqueIdentifier, companyId)
          .input("employeeWorkdayId", sql.UniqueIdentifier, String(row.absent_employee_workday_id))
          .query(`UPDATE employee_workdays SET expectation_status=N'CANCELLED',cancellation_reason=N'ASSIGNMENT',
            updated_at=SYSUTCDATETIME() WHERE company_id=@companyId AND id=@employeeWorkdayId
            AND expectation_status=N'EXPECTED'`);
        if ((cancelled.rowsAffected[0] ?? 0) !== 1) {
          throw new AppError(409, "REPLACEMENT_VACANCY_STALE", "La cobertura ya no está pendiente");
        }
      }
      await employeeWorkdayRepository.insertInTransaction(companyId, tx, {
        operationWorkdayId: String(row.operation_workday_id), employeeId: String(row.candidate_employee_id),
        operationAssignmentId: assignment.id,
      });
      const workDateForCoverage = toDateOnlyString(row.work_date as Date | string);
      await operationCoverageEventRepository.insert(
        {
          companyId,
          operationId: String(row.operation_id),
          operationalDate: workDateForCoverage,
          sourceType: "MANUAL_COVERAGE",
          replacedAssignmentId: row.absent_assignment_id ? String(row.absent_assignment_id) : null,
          replacedEmployeeId: String(row.absent_employee_id),
          replacementAssignmentId: assignment.id,
          replacementEmployeeId: String(row.candidate_employee_id),
          absentEmployeeWorkdayId: String(row.absent_employee_workday_id),
          coverageCommandId: `wa-replacement:${String(row.request_id)}:${randomUUID()}`,
          reason: "Cobertura vía WhatsApp (reemplazo)",
          resolvedByUserId: null,
        },
        tx,
      );
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("requestId", sql.UniqueIdentifier, String(row.request_id))
        .input("candidateId", sql.UniqueIdentifier, String(row.candidate_id))
        .input("employeeId", sql.UniqueIdentifier, String(row.candidate_employee_id))
        .query(`UPDATE replacement_request_candidates SET status=CASE WHEN id=@candidateId THEN N'SELECTED' ELSE N'REJECTED' END,
          updated_at=SYSUTCDATETIME() WHERE company_id=@companyId AND request_id=@requestId;
          UPDATE replacement_requests SET status=N'COVERED',resolved_employee_id=@employeeId,resolved_at=SYSUTCDATETIME(),
          updated_at=SYSUTCDATETIME()
          WHERE company_id=@companyId AND id=@requestId AND status=N'PENDING'`);
      await auditService.log(companyId, {
        action: "REPLACEMENT_COVERED", entityType: "replacement_request", entityId: String(row.request_id),
        newData: { candidateId: String(row.candidate_id), employeeId: String(row.candidate_employee_id) },
      }, tx);
      await tx.commit();
      return await buildCoverageConfirmation(companyId, row);
    } catch (error) {
      try { await tx.rollback(); } catch { /* transaction was not started or already settled */ }
      throw error;
    }
  },

  async markCoveredForAbsentWorkdayInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      absentEmployeeWorkdayId: string;
      absentEmployeeId: string;
      replacementEmployeeId: string;
    },
  ): Promise<void> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.absentEmployeeWorkdayId)
      .input("absentEmployeeId", sql.UniqueIdentifier, input.absentEmployeeId)
      .input("replacementEmployeeId", sql.UniqueIdentifier, input.replacementEmployeeId)
      .query(`
        UPDATE replacement_requests
        SET status = N'COVERED',
            resolved_employee_id = @replacementEmployeeId,
            resolved_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @employeeWorkdayId
          AND absent_employee_id = @absentEmployeeId
          AND status = N'PENDING'
      `);
    if ((result.rowsAffected[0] ?? 0) > 0) {
      await auditService.log(
        companyId,
        {
          action: "REPLACEMENT_COVERED",
          entityType: "replacement_request",
          entityId: input.absentEmployeeWorkdayId,
          newData: { replacementEmployeeId: input.replacementEmployeeId },
        },
        transaction,
      );
    }
  },

  async reopenPendingForAbsentWorkdayInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: { absentEmployeeWorkdayId: string; absentEmployeeId: string },
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.absentEmployeeWorkdayId)
      .input("absentEmployeeId", sql.UniqueIdentifier, input.absentEmployeeId)
      .query(`
        UPDATE replacement_requests
        SET status = N'PENDING',
            resolved_employee_id = NULL,
            resolved_at = NULL,
            notifications_materialized_at = NULL,
            candidates_materialized_at = NULL,
            primary_notification_alert_type = NULL,
            request_version = request_version + 1,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND absent_employee_workday_id = @employeeWorkdayId
          AND absent_employee_id = @absentEmployeeId
          AND status = N'COVERED'
      `);
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.absentEmployeeWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.absentEmployeeId)
      .query(`
        DELETE FROM replacement_request_candidates
        WHERE company_id = @companyId AND request_id IN (
          SELECT id FROM replacement_requests
          WHERE company_id = @companyId
            AND absent_employee_workday_id = @employeeWorkdayId
            AND absent_employee_id = @employeeId
            AND status = N'PENDING'
        )
      `);
  },
};
