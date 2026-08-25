import sql from "mssql";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import {
  buildAttendanceDuringAbsenceConflictKey,
  buildOperationalConflictIdempotencyKey,
} from "../types/absence-operational-impact";
import type { AttendanceRecord } from "../types/domain";
import type { EmployeeWorkdayCheckInCandidate } from "../types/employee-workday-availability";
import type { AttendanceValidationResult } from "../utils/attendance-validation";
import { isWithinCheckInAvailabilityWindow } from "../utils/resolve-check-in-availability-window";
import { getSimulationSessionId } from "../utils/bot-runtime-context";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { auditService } from "./audit.service";

export type CreateAttendanceForEmployeeWorkdayInput = {
  companyId: string;
  employeeId: string;
  employeeWorkdayId: string;
  sessionId: string;
  /** Business event time of the LOCATION WhatsApp message (stored on the attendance row). */
  receivedAt: Date;
  /**
   * Instant used to gate "still eligible now" (availability window).
   * Defaults to receivedAt. When LOCATION precedes selection, pass now while keeping receivedAt as the original LOCATION time.
   */
  eligibilityAt?: Date;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  validation: AttendanceValidationResult;
  messageSid: string;
};

export type CreateAttendanceForEmployeeWorkdayResult = {
  attendance: AttendanceRecord;
  recordedDuringApprovedAbsence: boolean;
  absenceRequestId: string | null;
  conflictId: string | null;
};

const recordAttendanceDuringAbsenceConflict = async (
  input: {
    companyId: string;
    employeeId: string;
    candidate: EmployeeWorkdayCheckInCandidate;
    attendanceId: string;
    messageSid: string;
  },
  transaction: sql.Transaction,
): Promise<{ absenceRequestId: string; conflictId: string } | null> => {
  if (
    input.candidate.expectationStatus !== "JUSTIFIED" ||
    !input.candidate.absenceRequestId
  ) {
    return null;
  }

  if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(input.companyId))) {
    return null;
  }

  const absence = await absenceRequestRepository.findById(
    input.companyId,
    input.candidate.absenceRequestId,
  );
  if (!absence || absence.status !== "APPROVED") {
    return null;
  }

  const version = absence.operationalImpactVersion ?? 1;
  const messageKey = buildAttendanceDuringAbsenceConflictKey({
    companyId: input.companyId,
    messageSid: input.messageSid,
  });
  const workdayKey = buildOperationalConflictIdempotencyKey({
    requestId: absence.id,
    version,
    conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
    targetEntityId: input.candidate.employeeWorkdayId,
  });

  const conflict = await absenceOperationalImpactRepository.upsertConflict(
    {
      companyId: input.companyId,
      absenceRequestId: absence.id,
      absenceVersion: version,
      conflictType: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
      severity: "CRITICAL",
      employeeId: input.employeeId,
      operationId: input.candidate.operationId,
      serviceId: input.candidate.serviceId,
      assignmentId: input.candidate.operationAssignmentId,
      employeeWorkdayId: input.candidate.employeeWorkdayId,
      operationWorkdayId: input.candidate.operationWorkdayId,
      attendanceRecordId: input.attendanceId,
      sourceMessageSid: input.messageSid,
      idempotencyKey: messageKey.length <= 200 ? messageKey : workdayKey,
      rangeStartAt: new Date(input.candidate.expectedStartAt),
      rangeEndAt: input.candidate.expectedEndAt
        ? new Date(input.candidate.expectedEndAt)
        : null,
    },
    transaction,
  );

  await auditService.log(
    input.companyId,
    {
      userId: null,
      action: "ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE",
      entityType: "absence_operational_conflict",
      entityId: conflict.id,
      newData: {
        absenceRequestId: absence.id,
        attendanceRecordId: input.attendanceId,
        employeeWorkdayId: input.candidate.employeeWorkdayId,
        operationId: input.candidate.operationId,
        messageSid: input.messageSid,
      },
    },
    transaction,
  );

  return { absenceRequestId: absence.id, conflictId: conflict.id };
};

export const employeeWorkdayAttendanceCommand = {
  async loadCheckInCandidate(
    companyId: string,
    employeeId: string,
    employeeWorkdayId: string,
    at: Date,
    options?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckInCandidate | null> {
    const candidate = await employeeWorkdayAvailabilityRepository.findCheckInCandidateById(
      companyId,
      employeeId,
      employeeWorkdayId,
      options,
    );
    if (!candidate || !isWithinCheckInAvailabilityWindow(candidate, at)) {
      return null;
    }
    return candidate;
  },

  async createAttendanceForEmployeeWorkday(
    input: CreateAttendanceForEmployeeWorkdayInput,
  ): Promise<CreateAttendanceForEmployeeWorkdayResult> {
    const simulationSessionId = getSimulationSessionId();
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const activeSession = await botSessionRepository.findValidActiveById(
        input.companyId,
        input.sessionId,
        transaction,
      );
      if (!activeSession || activeSession.state !== "WAITING_LOCATION") {
        await transaction.rollback();
        throw new Error("BOT_SESSION_STALE");
      }

      const candidate = await employeeWorkdayAvailabilityRepository.findCheckInCandidateById(
        input.companyId,
        input.employeeId,
        input.employeeWorkdayId,
        { simulationSessionId },
      );
      const gateAt = input.eligibilityAt ?? input.receivedAt;
      if (!candidate || !isWithinCheckInAvailabilityWindow(candidate, gateAt)) {
        await transaction.rollback();
        throw new Error("EMPLOYEE_WORKDAY_NOT_AVAILABLE");
      }

      const hasDuplicate = await attendanceRepository.hasActiveRecordByEmployeeWorkdayInTransaction(
        input.companyId,
        transaction,
        input.employeeWorkdayId,
        simulationSessionId,
      );
      if (hasDuplicate) {
        await transaction.rollback();
        throw new Error("EMPLOYEE_WORKDAY_ALREADY_ATTENDED");
      }

      const created = await attendanceRepository.createInTransaction(input.companyId, transaction, {
        operationId: candidate.operationId,
        employeeId: input.employeeId,
        employeeWorkdayId: input.employeeWorkdayId,
        receivedLatitude: input.latitude,
        receivedLongitude: input.longitude,
        distanceMeters: input.distanceMeters,
        validationStatus: input.validation.validationStatus,
        locationStatus: input.validation.locationStatus,
        punctualityStatus: input.validation.punctualityStatus,
        sourceMessageSid: input.messageSid,
        validationReason: input.validation.validationReason,
        receivedAt: input.receivedAt.toISOString(),
        isSimulation: Boolean(simulationSessionId),
        simulationSessionId,
      });

      const duringAbsence = await recordAttendanceDuringAbsenceConflict(
        {
          companyId: input.companyId,
          employeeId: input.employeeId,
          candidate,
          attendanceId: created.id,
          messageSid: input.messageSid,
        },
        transaction,
      );

      await botSessionRepository.updateSession(
        input.companyId,
        input.sessionId,
        { state: "COMPLETED" },
        transaction,
      );

      await transaction.commit();
      try {
        const { attendanceThresholdAlertService } = await import(
          "./attendance-threshold-alert.service"
        );
        await attendanceThresholdAlertService.markEmployeeDirty(
          input.companyId,
          input.employeeId,
        );
      } catch {
        // best-effort dirty mark; durable queue recovery covers misses via other triggers
      }
      return {
        attendance: created,
        recordedDuringApprovedAbsence: Boolean(duringAbsence),
        absenceRequestId: duringAbsence?.absenceRequestId ?? null,
        conflictId: duringAbsence?.conflictId ?? null,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
