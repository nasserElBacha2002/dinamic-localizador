import sql from "mssql";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import type { AttendanceRecord } from "../types/domain";
import type { EmployeeWorkdayCheckInCandidate } from "../types/employee-workday-availability";
import type { AttendanceValidationResult } from "../utils/attendance-validation";
import { isWithinCheckInAvailabilityWindow } from "../utils/resolve-check-in-availability-window";
import { getSimulationSessionId } from "../utils/bot-runtime-context";

export type CreateAttendanceForEmployeeWorkdayInput = {
  companyId: string;
  employeeId: string;
  employeeWorkdayId: string;
  sessionId: string;
  receivedAt: Date;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  validation: AttendanceValidationResult;
  messageSid: string;
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
  ): Promise<AttendanceRecord> {
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
      if (
        !candidate ||
        !isWithinCheckInAvailabilityWindow(candidate, input.receivedAt)
      ) {
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

      await botSessionRepository.updateSession(
        input.companyId,
        input.sessionId,
        { state: "COMPLETED" },
        transaction,
      );

      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
