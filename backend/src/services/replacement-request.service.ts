import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { individualRecommendationService } from "./individual-recommendation.service";
import { employeeAvailabilityService } from "./employee-availability.service";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { adminAlertNotificationRepository } from "../repositories/admin-alert-notification.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { auditService } from "./audit.service";
import { formatServiceReferenceFromFields } from "../utils/format-service-reference";
import { formatLocalTime } from "../utils/attendance-validation";
import { companySettingsRepository } from "../repositories/company-settings.repository";

type ReplacementContext = {
  requestId: string;
  operationWorkdayId: string;
  operationId: string;
  workDate: string;
  operationShiftId: string | null;
  expectedStartAt: string;
  expectedEndAt: string | null;
  absentName: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  status: string;
  candidatesMaterializedAt: string | null;
  notificationsMaterializedAt: string | null;
};

const staleReply = "⚠️ Esta opción ya no está disponible. La situación del turno cambió.";
const coveredReply = "Esta ausencia ya fue cubierta.";

const toContext = (row: Record<string, unknown>): ReplacementContext => ({
  requestId: String(row.request_id),
  operationWorkdayId: String(row.operation_workday_id),
  operationId: String(row.operation_id),
  workDate: String(row.work_date),
  operationShiftId: row.operation_shift_id ? String(row.operation_shift_id) : null,
  expectedStartAt: String(row.expected_start_at),
  expectedEndAt: row.expected_end_at ? String(row.expected_end_at) : null,
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
});

const requestContextSql = `
  SELECT rr.id request_id, rr.status, rr.candidates_materialized_at, rr.notifications_materialized_at,
    ow.id operation_workday_id, ow.operation_id, ow.work_date, ow.operation_shift_id,
    ow.expected_start_at, ow.expected_end_at, e.name absent_name, s.name service_name,
    s.address service_address, s.locality service_locality
  FROM replacement_requests rr
  JOIN operation_workdays ow ON ow.id=rr.operation_workday_id AND ow.company_id=rr.company_id
  JOIN scheduled_operations o ON o.id=ow.operation_id AND o.company_id=ow.company_id
  JOIN operational_locations s ON s.id=o.service_id AND s.company_id=o.company_id
  JOIN employees e ON e.id=rr.absent_employee_id AND e.company_id=rr.company_id
  WHERE rr.company_id=@companyId AND rr.id=@requestId
`;

const findOrCreateRequest = async (input: {
  companyId: string;
  employeeWorkdayId: string;
  employeeId: string;
}): Promise<ReplacementContext> => {
  const tx = new sql.Transaction(getPool());
  await tx.begin();
  try {
    const source = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .query(`
        SELECT ew.id, ow.id operation_workday_id, ow.status workday_status
        FROM employee_workdays ew WITH (UPDLOCK,HOLDLOCK)
        JOIN operation_workdays ow ON ow.id=ew.operation_workday_id AND ow.company_id=ew.company_id
        WHERE ew.company_id=@companyId AND ew.id=@employeeWorkdayId AND ew.employee_id=@employeeId
      `);
    const sourceRow = source.recordset[0] as Record<string, unknown> | undefined;
    if (!sourceRow || String(sourceRow.workday_status) !== "ACTIVE") {
      throw new AppError(409, "REPLACEMENT_WORKDAY_INVALID", "La jornada ya no está disponible");
    }

    const existing = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .query(`SELECT id FROM replacement_requests WITH (UPDLOCK,HOLDLOCK)
        WHERE company_id=@companyId AND absent_employee_workday_id=@employeeWorkdayId AND status=N'PENDING'`);
    let requestId = existing.recordset[0] ? String((existing.recordset[0] as Record<string, unknown>).id) : null;

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
        .query(`INSERT replacement_requests(company_id,operation_workday_id,absent_employee_workday_id,absent_employee_id,parent_request_id,root_request_id)
          OUTPUT INSERTED.id VALUES(@companyId,@operationWorkdayId,@employeeWorkdayId,@employeeId,@parentId,@rootId)`);
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

const materializeCandidates = async (
  companyId: string,
  context: ReplacementContext,
): Promise<ReplacementContext> => {
  if (context.status !== "PENDING" || context.candidatesMaterializedAt) return context;

  // The recommender is read-only and deliberately runs outside a write transaction.
  const recommendation = await individualRecommendationService.recommendEmployees(
    companyId, context.operationId, 20, context.workDate,
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
  for (const candidate of recommendation.recommendations) {
    if (excluded.has(candidate.employee.id)) continue;
    const availability = await employeeAvailabilityService.getAvailabilityForInterval({
      companyId,
      employeeId: candidate.employee.id,
      startAt: new Date(context.expectedStartAt),
      endAt: context.expectedEndAt ? new Date(context.expectedEndAt) : new Date(context.expectedStartAt),
    });
    if (availability.status === "AVAILABLE") eligible.push(candidate);
    if (eligible.length === 3) break;
  }

  const tx = new sql.Transaction(getPool());
  await tx.begin();
  try {
    const locked = await new sql.Request(tx)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .query(`SELECT status,candidates_materialized_at FROM replacement_requests WITH (UPDLOCK,HOLDLOCK)
        WHERE company_id=@companyId AND id=@requestId`);
    const row = locked.recordset[0] as Record<string, unknown> | undefined;
    if (!row || String(row.status) !== "PENDING" || row.candidates_materialized_at) {
      await tx.commit();
      return context;
    }

    for (const [index, candidate] of eligible.entries()) {
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("requestId", sql.UniqueIdentifier, context.requestId)
        .input("employeeId", sql.UniqueIdentifier, candidate.employee.id)
        .input("rank", sql.Int, index + 1)
        .input("score", sql.Decimal(9, 6), candidate.score)
        .input("reasons", sql.NVarChar(sql.MAX), JSON.stringify(candidate.reasons))
        .query(`INSERT replacement_request_candidates(company_id,request_id,employee_id,rank,score,reasons_json)
          VALUES(@companyId,@requestId,@employeeId,@rank,@score,@reasons)`);
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

const materializeNotifications = async (
  companyId: string,
  input: { employeeId: string; employeeWorkdayId: string },
  context: ReplacementContext,
): Promise<void> => {
  if (context.status !== "PENDING" || !context.candidatesMaterializedAt || context.notificationsMaterializedAt) return;
  const candidates = await getPool().request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("requestId", sql.UniqueIdentifier, context.requestId)
    .query(`SELECT c.rank,e.name FROM replacement_request_candidates c JOIN employees e
      ON e.id=c.employee_id AND e.company_id=c.company_id
      WHERE c.company_id=@companyId AND c.request_id=@requestId ORDER BY c.rank`);
  if (candidates.recordset.length === 0) return;
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = settings?.operationTimezone ?? "America/Argentina/Buenos_Aires";
  const offered = new Map(candidates.recordset.map((row: Record<string, unknown>) => [Number(row.rank), String(row.name)]));
  const variables: Record<string, string> = {
    "1": context.absentName,
    "2": formatServiceReferenceFromFields({ serviceName: context.serviceName, serviceAddress: context.serviceAddress, serviceLocality: context.serviceLocality }),
    "3": context.workDate,
    "4": formatLocalTime(context.expectedStartAt, timezone),
    "5": offered.get(1) ?? "—",
    "6": offered.get(2) ?? "—",
    "7": offered.get(3) ?? "—",
  };

  const recipients = await companyAlertRecipientRepository.findEnabledRecipients(companyId, "OPERATIONAL");
  for (const recipient of recipients) {
    const tx = new sql.Transaction(getPool());
    await tx.begin();
    try {
      const outbox = await adminAlertNotificationRepository.enqueue({
        companyId, recipientId: recipient.id, recipientPhone: recipient.phoneNumber,
        employeeId: input.employeeId, operationId: context.operationId, employeeWorkdayId: input.employeeWorkdayId,
        alertType: "REPLACEMENT_REQUEST", severity: "WARNING", templateCategory: "OPERATIONAL",
        deduplicationKey: `replacement:${context.requestId}`, contentVariablesJson: JSON.stringify(variables),
      }, tx);
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("requestId", sql.UniqueIdentifier, context.requestId)
        .input("recipientId", sql.UniqueIdentifier, recipient.id)
        .input("notificationId", sql.UniqueIdentifier, outbox.notification.id)
        .query(`IF NOT EXISTS (
          SELECT 1 FROM replacement_request_notifications WITH (UPDLOCK,HOLDLOCK)
          WHERE company_id=@companyId AND request_id=@requestId AND recipient_id=@recipientId
        ) INSERT replacement_request_notifications(company_id,request_id,recipient_id,notification_id)
          VALUES(@companyId,@requestId,@recipientId,@notificationId)`);
      await tx.commit();
    } catch (error) {
      try { await tx.rollback(); } catch { /* transaction was not started or already settled */ }
      throw error;
    }
  }

  const finalize = new sql.Transaction(getPool());
  await finalize.begin();
  try {
    const result = await new sql.Request(finalize)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.UniqueIdentifier, context.requestId)
      .input("recipientCount", sql.Int, recipients.length)
      .query(`UPDATE replacement_requests SET notifications_materialized_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME()
        WHERE company_id=@companyId AND id=@requestId AND status=N'PENDING'
          AND (SELECT COUNT(*) FROM replacement_request_notifications
               WHERE company_id=@companyId AND request_id=@requestId)=@recipientCount`);
    if ((result.rowsAffected[0] ?? 0) > 0) {
      await auditService.log(companyId, {
        action: "REPLACEMENT_NOTIFICATION_MATERIALIZED",
        entityType: "replacement_request",
        entityId: context.requestId,
        newData: { recipientCount: recipients.length },
      }, finalize);
    }
    await finalize.commit();
  } catch (error) {
    try { await finalize.rollback(); } catch { /* transaction was not started or already settled */ }
    throw error;
  }
};

export const replacementRequestService = {
  async createForUnavailable(input: { companyId: string; employeeWorkdayId: string; employeeId: string }): Promise<void> {
    let context = await findOrCreateRequest(input);
    context = await materializeCandidates(input.companyId, context);
    await materializeNotifications(input.companyId, input, context);
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
      const data = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("phone", sql.NVarChar(20), phone)
        .input("originalMessageSid", sql.NVarChar(100), originalRepliedMessageSid)
        .input("rank", sql.Int, Number(match[1]))
        .query(`SELECT rr.id request_id,rr.status request_status,rr.absent_employee_workday_id,
          rc.id candidate_id,rc.employee_id candidate_employee_id,rc.status candidate_status,
          ow.id operation_workday_id,ow.work_date,ow.operation_id,ow.operation_shift_id,
          ow.expected_start_at,ow.expected_end_at,ow.status workday_status,
          e.name candidate_name,s.name service_name,absent.unavailable_at
          FROM replacement_request_notifications rn
          JOIN company_alert_recipients ar ON ar.id=rn.recipient_id AND ar.company_id=rn.company_id
          JOIN whatsapp_admin_alert_notifications an ON an.id=rn.notification_id AND an.company_id=rn.company_id
          JOIN replacement_requests rr WITH (UPDLOCK,HOLDLOCK) ON rr.id=rn.request_id AND rr.company_id=rn.company_id
          JOIN replacement_request_candidates rc WITH (UPDLOCK,HOLDLOCK)
            ON rc.request_id=rr.id AND rc.company_id=rr.company_id AND rc.rank=@rank
          JOIN operation_workdays ow WITH (UPDLOCK,HOLDLOCK) ON ow.id=rr.operation_workday_id AND ow.company_id=rr.company_id
          JOIN employees e ON e.id=rc.employee_id AND e.company_id=rr.company_id
          JOIN scheduled_operations o ON o.id=ow.operation_id AND o.company_id=ow.company_id
          JOIN operational_locations s ON s.id=o.service_id AND s.company_id=o.company_id
          JOIN employee_workdays absent ON absent.id=rr.absent_employee_workday_id AND absent.company_id=rr.company_id
          WHERE rn.company_id=@companyId AND ar.phone_number=@phone
            AND an.provider_message_sid=@originalMessageSid`);
      const row = data.recordset[0] as Record<string, unknown> | undefined;
      if (!row) { await tx.commit(); return staleReply; }
      if (String(row.request_status) === "COVERED") {
        await tx.commit();
        return coveredReply;
      }
      if (String(row.request_status) !== "PENDING") { await tx.commit(); return staleReply; }
      if (String(row.candidate_status) !== "OFFERED") { await tx.commit(); return staleReply; }
      if (String(row.workday_status) !== "ACTIVE" || !row.unavailable_at) {
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

      await new sql.Request(tx)
        .input("resource", sql.NVarChar(255), `replacement-candidate:${companyId}:${String(row.candidate_employee_id)}`)
        .query(`DECLARE @result INT;
          EXEC @result = sp_getapplock @Resource=@resource, @LockMode='Exclusive',
            @LockOwner='Transaction', @LockTimeout=10000;
          IF @result < 0 THROW 51000, 'REPLACEMENT_CANDIDATE_LOCK_FAILED', 1;`);

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

      const assignment = await operationEmployeeRepository.createInTransaction(companyId, tx, {
        operationId: String(row.operation_id), employeeId: String(row.candidate_employee_id),
        validFrom: String(row.work_date), validUntil: String(row.work_date),
        assignmentOrigin: "COVERAGE", operationShiftId: row.operation_shift_id ? String(row.operation_shift_id) : null,
      });
      const cancelled = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeWorkdayId", sql.UniqueIdentifier, String(row.absent_employee_workday_id))
        .query(`UPDATE employee_workdays SET expectation_status=N'CANCELLED',cancellation_reason=N'ASSIGNMENT',
          updated_at=SYSUTCDATETIME() WHERE company_id=@companyId AND id=@employeeWorkdayId
          AND expectation_status=N'EXPECTED'`);
      if ((cancelled.rowsAffected[0] ?? 0) !== 1) throw new AppError(409, "REPLACEMENT_VACANCY_STALE", "La cobertura ya no está pendiente");
      await employeeWorkdayRepository.insertInTransaction(companyId, tx, {
        operationWorkdayId: String(row.operation_workday_id), employeeId: String(row.candidate_employee_id),
        operationAssignmentId: assignment.id,
      });
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("requestId", sql.UniqueIdentifier, String(row.request_id))
        .input("candidateId", sql.UniqueIdentifier, String(row.candidate_id))
        .input("employeeId", sql.UniqueIdentifier, String(row.candidate_employee_id))
        .query(`UPDATE replacement_request_candidates SET status=CASE WHEN id=@candidateId THEN N'SELECTED' ELSE N'REJECTED' END,
          updated_at=SYSUTCDATETIME() WHERE company_id=@companyId AND request_id=@requestId;
          UPDATE replacement_requests SET status=N'COVERED',resolved_employee_id=@employeeId,resolved_at=SYSUTCDATETIME(),
          request_version=request_version+1,updated_at=SYSUTCDATETIME()
          WHERE company_id=@companyId AND id=@requestId AND status=N'PENDING'`);
      await auditService.log(companyId, {
        action: "REPLACEMENT_COVERED", entityType: "replacement_request", entityId: String(row.request_id),
        newData: { candidateId: String(row.candidate_id), employeeId: String(row.candidate_employee_id) },
      }, tx);
      await tx.commit();
      return `✅ Reemplazo asignado.\n\n${String(row.candidate_name)} fue asignado a ${String(row.service_name)} para el ${String(row.work_date)}, ${new Date(String(row.expected_start_at)).toISOString().slice(11,16)}.`;
    } catch (error) {
      try { await tx.rollback(); } catch { /* transaction was not started or already settled */ }
      throw error;
    }
  },
};
