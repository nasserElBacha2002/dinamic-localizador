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

const optionPayload = (rank: number) => `replacement_option_${rank}`;

/** Occurrence-only replacement orchestration. It deliberately never cancels the base assignment. */
export const replacementRequestService = {
  async createForUnavailable(input: { companyId: string; employeeWorkdayId: string; employeeId: string }): Promise<void> {
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const context = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .query(`SELECT ew.id employee_workday_id, ew.employee_id, ow.id operation_workday_id, ow.operation_id, ow.work_date,
          ow.operation_shift_id, ow.expected_start_at, ow.expected_end_at, ow.status workday_status,
          e.name absent_name, s.name service_name, s.address service_address, s.locality service_locality
          FROM employee_workdays ew WITH (UPDLOCK,HOLDLOCK)
          JOIN operation_workdays ow ON ow.id=ew.operation_workday_id AND ow.company_id=ew.company_id
          JOIN employees e ON e.id=ew.employee_id AND e.company_id=ew.company_id
          JOIN scheduled_operations o ON o.id=ow.operation_id AND o.company_id=ow.company_id
          JOIN operational_locations s ON s.id=o.service_id AND s.company_id=o.company_id
          WHERE ew.company_id=@companyId AND ew.id=@employeeWorkdayId AND ew.employee_id=@employeeId`);
      const row = context.recordset[0] as Record<string, unknown> | undefined;
      if (!row || String(row.workday_status) !== "ACTIVE") throw new AppError(409, "REPLACEMENT_WORKDAY_INVALID", "La jornada ya no está disponible");
      const existing = await new sql.Request(tx).input("companyId", sql.UniqueIdentifier, input.companyId).input("ew", sql.UniqueIdentifier, input.employeeWorkdayId).query(`SELECT TOP 1 id FROM replacement_requests WITH (UPDLOCK,HOLDLOCK) WHERE company_id=@companyId AND absent_employee_workday_id=@ew AND status=N'PENDING'`);
      if (existing.recordset[0]) { await tx.commit(); return; }
      const parent = await new sql.Request(tx).input("companyId", sql.UniqueIdentifier, input.companyId).input("ow", sql.UniqueIdentifier, String(row.operation_workday_id)).input("employeeId", sql.UniqueIdentifier, input.employeeId).query(`SELECT TOP 1 id, COALESCE(root_request_id,id) root_id FROM replacement_requests WHERE company_id=@companyId AND operation_workday_id=@ow AND resolved_employee_id=@employeeId AND status=N'COVERED' ORDER BY resolved_at DESC`);
      const parentRow = parent.recordset[0] as Record<string, unknown> | undefined;
      const created = await new sql.Request(tx).input("companyId",sql.UniqueIdentifier,input.companyId).input("ow",sql.UniqueIdentifier,String(row.operation_workday_id)).input("ew",sql.UniqueIdentifier,input.employeeWorkdayId).input("employeeId",sql.UniqueIdentifier,input.employeeId).input("parent",sql.UniqueIdentifier,parentRow ? String(parentRow.id) : null).input("root",sql.UniqueIdentifier,parentRow ? String(parentRow.root_id) : null).query(`INSERT replacement_requests(company_id,operation_workday_id,absent_employee_workday_id,absent_employee_id,parent_request_id,root_request_id) OUTPUT INSERTED.id VALUES(@companyId,@ow,@ew,@employeeId,@parent,@root)`);
      const requestId = String((created.recordset[0] as Record<string, unknown>).id);
      if (!parentRow) await new sql.Request(tx).input("id",sql.UniqueIdentifier,requestId).query(`UPDATE replacement_requests SET root_request_id=@id WHERE id=@id`);
      await tx.commit();

      // Recommendation is read-only; offered candidates are subsequently persisted atomically.
      const recommendations = await individualRecommendationService.recommendEmployees(input.companyId, String(row.operation_id), 20, String(row.work_date));
      const excludedResult = await getPool().request().input("companyId",sql.UniqueIdentifier,input.companyId).input("requestId",sql.UniqueIdentifier,requestId).query(`WITH chain AS (SELECT id,parent_request_id,absent_employee_id FROM replacement_requests WHERE id=@requestId UNION ALL SELECT r.id,r.parent_request_id,r.absent_employee_id FROM replacement_requests r JOIN chain c ON c.parent_request_id=r.id) SELECT absent_employee_id FROM chain`);
      const excluded = new Set(excludedResult.recordset.map((x: Record<string, unknown>) => String(x.absent_employee_id)));
      const eligible: typeof recommendations.recommendations = [];
      for (const candidate of recommendations.recommendations) {
        if (excluded.has(candidate.employee.id)) continue;
        const availability = await employeeAvailabilityService.getAvailabilityForInterval({ companyId: input.companyId, employeeId: candidate.employee.id, startAt: new Date(String(row.expected_start_at)), endAt: row.expected_end_at ? new Date(String(row.expected_end_at)) : new Date(String(row.expected_start_at)) });
        if (availability.status !== "AVAILABLE") continue;
        eligible.push(candidate); if (eligible.length === 3) break;
      }
      const persist = new sql.Transaction(getPool()); await persist.begin();
      for (const [index, candidate] of eligible.entries()) await new sql.Request(persist).input("requestId",sql.UniqueIdentifier,requestId).input("companyId",sql.UniqueIdentifier,input.companyId).input("employeeId",sql.UniqueIdentifier,candidate.employee.id).input("rank",sql.Int,index+1).input("score",sql.Decimal(9,6),candidate.score).input("reasons",sql.NVarChar(sql.MAX),JSON.stringify(candidate.reasons)).query(`INSERT replacement_request_candidates(request_id,company_id,employee_id,rank,score,reasons_json) VALUES(@requestId,@companyId,@employeeId,@rank,@score,@reasons)`);
      if (!eligible.length) await new sql.Request(persist).input("id",sql.UniqueIdentifier,requestId).query(`UPDATE replacement_requests SET status=N'FAILED',updated_at=SYSUTCDATETIME() WHERE id=@id`);
      await persist.commit();
      if (!eligible.length) return;
      const settings = await companySettingsRepository.findByCompanyId(input.companyId);
      const tz = settings?.operationTimezone ?? "America/Argentina/Buenos_Aires";
      const vars: Record<string,string> = { "1":String(row.absent_name), "2":formatServiceReferenceFromFields({serviceName:String(row.service_name),serviceAddress:row.service_address ? String(row.service_address):null,serviceLocality:row.service_locality ? String(row.service_locality):null}), "3":String(row.work_date), "4":formatLocalTime(String(row.expected_start_at),tz), "5":eligible[0]?.employee.name ?? "—", "6":eligible[1]?.employee.name ?? "—", "7":eligible[2]?.employee.name ?? "—" };
      for (const recipient of await companyAlertRecipientRepository.findEnabledRecipients(input.companyId,"OPERATIONAL")) {
        const outbox = await adminAlertNotificationRepository.enqueue({companyId:input.companyId,recipientId:recipient.id,recipientPhone:recipient.phoneNumber,employeeId:input.employeeId,operationId:String(row.operation_id),employeeWorkdayId:input.employeeWorkdayId,alertType:"REPLACEMENT_REQUEST",severity:"WARNING",templateCategory:"OPERATIONAL",deduplicationKey:`replacement:${requestId}`,contentVariablesJson:JSON.stringify(vars)});
        await getPool().request().input("companyId",sql.UniqueIdentifier,input.companyId).input("requestId",sql.UniqueIdentifier,requestId).input("recipientId",sql.UniqueIdentifier,recipient.id).input("notificationId",sql.UniqueIdentifier,outbox.notification.id).query(`IF NOT EXISTS(SELECT 1 FROM replacement_request_notifications WHERE request_id=@requestId AND recipient_id=@recipientId) INSERT replacement_request_notifications(company_id,request_id,recipient_id,notification_id) VALUES(@companyId,@requestId,@recipientId,@notificationId)`);
      }
      await auditService.log(input.companyId,{action:"REPLACEMENT_REQUEST_CREATED",entityType:"replacement_request",entityId:requestId,newData:{employeeWorkdayId:input.employeeWorkdayId,candidateCount:eligible.length}});
    } catch (e) { try { await tx.rollback(); } catch {} throw e; }
  },

  /** Static approved button ids are resolved only against the recipient's latest pending snapshot. */
  async handleQuickReply(companyId: string, phone: string, payload: string): Promise<string | null> {
    const match = /^replacement_option_([1-3])$/.exec(payload.trim()); if (!match) return null;
    const tx = new sql.Transaction(getPool()); await tx.begin();
    try {
      const data = await new sql.Request(tx).input("companyId",sql.UniqueIdentifier,companyId).input("phone",sql.NVarChar(20),phone).input("rank",sql.Int,Number(match[1])).query(`SELECT TOP 1 rr.*, rc.id candidate_id,rc.employee_id candidate_employee_id,rc.status candidate_status,ow.id operation_workday_id,ow.work_date,ow.operation_id,ow.operation_shift_id,ow.expected_start_at,ow.expected_end_at,e.name candidate_name,s.name service_name FROM replacement_request_notifications rn JOIN company_alert_recipients ar ON ar.id=rn.recipient_id AND ar.company_id=rn.company_id JOIN replacement_requests rr WITH(UPDLOCK,HOLDLOCK) ON rr.id=rn.request_id AND rr.company_id=rn.company_id JOIN replacement_request_candidates rc WITH(UPDLOCK,HOLDLOCK) ON rc.request_id=rr.id AND rc.rank=@rank JOIN operation_workdays ow WITH(UPDLOCK,HOLDLOCK) ON ow.id=rr.operation_workday_id AND ow.company_id=rr.company_id JOIN scheduled_operations o ON o.id=ow.operation_id AND o.company_id=ow.company_id JOIN operational_locations s ON s.id=o.service_id AND s.company_id=o.company_id JOIN employees e ON e.id=rc.employee_id AND e.company_id=rr.company_id WHERE rn.company_id=@companyId AND ar.phone_number=@phone AND rr.status=N'PENDING' AND ow.status=N'ACTIVE' AND e.active=1 AND NOT EXISTS(SELECT 1 FROM attendance_records arx WHERE arx.company_id=rr.company_id AND arx.employee_workday_id=rr.absent_employee_workday_id AND arx.validation_status IN(N'VALID',N'PENDING_REVIEW')) AND NOT EXISTS(SELECT 1 FROM employee_workdays ew2 JOIN operation_workdays ow2 ON ow2.id=ew2.operation_workday_id AND ow2.company_id=ew2.company_id WHERE ew2.company_id=rr.company_id AND ew2.employee_id=rc.employee_id AND ew2.expectation_status=N'EXPECTED' AND ow2.status=N'ACTIVE' AND ow2.id<>ow.id AND ow2.expected_start_at < COALESCE(ow.expected_end_at,ow.expected_start_at) AND COALESCE(ow2.expected_end_at,ow2.expected_start_at)>ow.expected_start_at) ORDER BY rn.created_at DESC`);
      const row=data.recordset[0] as Record<string,unknown>|undefined; if(!row){await tx.commit();return "Esta ausencia ya fue cubierta.";}
      if(String(row.candidate_status)!=="OFFERED"){await tx.commit();return "⚠️ Esta opción ya no está disponible. La situación del turno cambió.";}
      const availability=await employeeAvailabilityService.getAvailabilityForInterval({companyId,employeeId:String(row.candidate_employee_id),startAt:new Date(String(row.expected_start_at)),endAt:row.expected_end_at?new Date(String(row.expected_end_at)):new Date(String(row.expected_start_at))});
      if(availability.status!=="AVAILABLE"){await new sql.Request(tx).input("id",sql.UniqueIdentifier,String(row.candidate_id)).query(`UPDATE replacement_request_candidates SET status=N'STALE' WHERE id=@id`);await tx.commit();return "⚠️ Esta opción ya no está disponible. La situación del turno cambió.";}
      const assignment=await operationEmployeeRepository.createInTransaction(companyId,tx,{operationId:String(row.operation_id),employeeId:String(row.candidate_employee_id),validFrom:String(row.work_date),validUntil:String(row.work_date),assignmentOrigin:"COVERAGE",operationShiftId:row.operation_shift_id?String(row.operation_shift_id):null});
      // Occurrence-level cancellation only: the original recurring assignment remains valid.
      await new sql.Request(tx).input("companyId",sql.UniqueIdentifier,companyId).input("id",sql.UniqueIdentifier,String(row.absent_employee_workday_id)).query(`UPDATE employee_workdays SET expectation_status=N'CANCELLED',cancellation_reason=N'ASSIGNMENT',updated_at=SYSUTCDATETIME() WHERE company_id=@companyId AND id=@id AND expectation_status=N'EXPECTED'`);
      await employeeWorkdayRepository.insertInTransaction(companyId,tx,{operationWorkdayId:String(row.operation_workday_id),employeeId:String(row.candidate_employee_id),operationAssignmentId:assignment.id});
      await new sql.Request(tx).input("request",sql.UniqueIdentifier,String(row.id)).input("candidate",sql.UniqueIdentifier,String(row.candidate_id)).input("employee",sql.UniqueIdentifier,String(row.candidate_employee_id)).query(`UPDATE replacement_request_candidates SET status=CASE WHEN id=@candidate THEN N'SELECTED' ELSE N'REJECTED' END,updated_at=SYSUTCDATETIME() WHERE request_id=@request; UPDATE replacement_requests SET status=N'COVERED',resolved_employee_id=@employee,resolved_at=SYSUTCDATETIME(),request_version=request_version+1,updated_at=SYSUTCDATETIME() WHERE id=@request AND status=N'PENDING'`);
      await auditService.log(companyId,{action:"REPLACEMENT_COVERED",entityType:"replacement_request",entityId:String(row.id),newData:{candidateId:String(row.candidate_id),employeeId:String(row.candidate_employee_id)}},tx);
      await tx.commit(); return `✅ Reemplazo asignado.\n\n${String(row.candidate_name)} fue asignado a ${String(row.service_name)} para el ${String(row.work_date)}, ${new Date(String(row.expected_start_at)).toISOString().slice(11,16)}.`;
    } catch(e){try{await tx.rollback();}catch{} throw e;}
  },
  optionPayload,
};
