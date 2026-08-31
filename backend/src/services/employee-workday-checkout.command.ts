import sql from "mssql";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import type { AttendanceRecord } from "../types/domain";
import type { CheckoutStatus } from "../constants/checkout-status";
import { runCheckoutWithoutLocationBeforeCommitHookForTests } from "../utils/checkout-transaction-hooks";
import { isActiveAttendanceDuplicateKeyError } from "../utils/attendance-duplicate-errors";
import { employeeWorkdayAvailabilityService } from "./employee-workday-availability.service";
import { getSimulationSessionId } from "../utils/bot-runtime-context";

export type CheckoutWriteFields = {
  checkoutLatitude: number | null;
  checkoutLongitude: number | null;
  checkoutDistanceMeters: number | null;
  checkoutStatus: CheckoutStatus;
  checkoutReviewReason: string | null;
  earlyDepartureMinutes: number;
  extraWorkedMinutes: number;
  checkoutMessageSid: string;
  checkoutAt: string;
};

export type RegisterCheckoutWithoutLocationInput = {
  companyId: string;
  attendanceId: string;
  sessionId?: string;
  fields: CheckoutWriteFields;
};

export type RegisterCheckoutWithLocationInput = {
  companyId: string;
  employeeId: string;
  attendanceId: string;
  sessionId: string;
  employeeWorkdayId: string;
  attendanceRecordId: string;
  eligibilityAt: Date;
  expectedSessionState: "WAITING_CHECKOUT_LOCATION";
  fields: CheckoutWriteFields;
};

export type RegisterExitWithoutArrivalInput = {
  companyId: string;
  employeeId: string;
  operationId: string;
  employeeWorkdayId: string;
  sessionId?: string;
  eligibilityAt: Date;
  expectedSessionState?: "WAITING_CHECKOUT_LOCATION";
  fields: CheckoutWriteFields;
};

/**
 * Typed durable outcomes. Conversation flows map these to WhatsApp copy;
 * the command never builds TwiML or calls Twilio.
 */
export type CheckoutCommandFailureCode =
  | "BOT_SESSION_STALE"
  | "CHECKOUT_CANDIDATE_EXPIRED"
  | "CHECKOUT_CANDIDATE_UNAVAILABLE"
  | "CHECKOUT_DUPLICATE"
  | "CHECKOUT_MESSAGE_SID_DUPLICATE";

export class CheckoutCommandError extends Error {
  readonly code: CheckoutCommandFailureCode;

  constructor(code: CheckoutCommandFailureCode, message?: string) {
    super(message ?? code);
    this.name = "CheckoutCommandError";
    this.code = code;
  }
}

const isCheckoutMessageSidUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("UQ_attendance_records_checkout_message_sid");

const rollbackIfActive = async (
  transaction: sql.Transaction,
  committed: boolean,
): Promise<void> => {
  if (committed) {
    return;
  }
  try {
    await transaction.rollback();
  } catch (rollbackError) {
    console.error("[employee-workday-checkout] rollback failed", rollbackError);
  }
};

export const resolveExitOnlyValidationStatus = (
  checkoutStatus: CheckoutStatus,
): "VALID" | "PENDING_REVIEW" | "REJECTED" => {
  if (checkoutStatus === "CHECKOUT_REJECTED") {
    return "REJECTED";
  }
  if (
    checkoutStatus === "CHECKOUT_LOCATION_REVIEW" ||
    checkoutStatus === "CHECKOUT_EARLY_REVIEW"
  ) {
    return "PENDING_REVIEW";
  }
  return "VALID";
};

export const employeeWorkdayCheckoutCommand = {
  /**
   * Atomic: register checkout (CAS on checkout_at IS NULL) + optional session COMPLETED.
   * Caller must build WhatsApp responses after this returns (never inside the TX).
   */
  async registerCheckoutWithoutLocation(
    input: RegisterCheckoutWithoutLocationInput,
  ): Promise<AttendanceRecord> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    let committed = false;

    await transaction.begin();
    try {
      const updated = await attendanceRepository.registerCheckoutInTransaction(
        input.companyId,
        transaction,
        {
          attendanceId: input.attendanceId,
          ...input.fields,
        },
      );

      if (!updated) {
        throw new CheckoutCommandError("CHECKOUT_DUPLICATE");
      }

      if (input.sessionId) {
        await botSessionRepository.updateSession(
          input.companyId,
          input.sessionId,
          { state: "COMPLETED" },
          transaction,
        );
      }

      // Test seam: injected failure after both writes, before commit (H4 atomicity).
      await runCheckoutWithoutLocationBeforeCommitHookForTests();

      await transaction.commit();
      committed = true;
      try {
        const { attendanceThresholdAlertService } = await import(
          "./attendance-threshold-alert.service"
        );
        await attendanceThresholdAlertService.markEmployeeDirty(
          input.companyId,
          updated.employeeId,
        );
      } catch {
        // best-effort dirty mark
      }
      return updated;
    } catch (error) {
      await rollbackIfActive(transaction, committed);
      if (error instanceof CheckoutCommandError) {
        throw error;
      }
      if (isCheckoutMessageSidUniqueViolation(error)) {
        throw new CheckoutCommandError("CHECKOUT_MESSAGE_SID_DUPLICATE");
      }
      throw error;
    }
  },

  /**
   * Atomic: validate active WAITING_CHECKOUT_LOCATION session, refresh candidate,
   * register checkout, mark session COMPLETED.
   */
  async registerCheckoutWithLocation(
    input: RegisterCheckoutWithLocationInput,
  ): Promise<AttendanceRecord> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    let committed = false;

    await transaction.begin();
    try {
      const activeSession = await botSessionRepository.findValidActiveById(
        input.companyId,
        input.sessionId,
        transaction,
      );

      if (!activeSession || activeSession.state !== input.expectedSessionState) {
        throw new CheckoutCommandError("BOT_SESSION_STALE");
      }

      const refreshed = await employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
        input.companyId,
        input.employeeId,
        input.attendanceRecordId,
        input.eligibilityAt,
      );
      if (
        refreshed.kind !== "eligible" ||
        refreshed.candidate.employeeWorkdayId !== input.employeeWorkdayId
      ) {
        throw new CheckoutCommandError(
          refreshed.kind === "expired"
            ? "CHECKOUT_CANDIDATE_EXPIRED"
            : "CHECKOUT_CANDIDATE_UNAVAILABLE",
        );
      }

      const updated = await attendanceRepository.registerCheckoutInTransaction(
        input.companyId,
        transaction,
        {
          attendanceId: input.attendanceId,
          ...input.fields,
        },
      );

      if (!updated) {
        throw new CheckoutCommandError("CHECKOUT_DUPLICATE");
      }

      await botSessionRepository.updateSession(
        input.companyId,
        input.sessionId,
        { state: "COMPLETED" },
        transaction,
      );

      await transaction.commit();
      committed = true;
      try {
        const { attendanceThresholdAlertService } = await import(
          "./attendance-threshold-alert.service"
        );
        await attendanceThresholdAlertService.markEmployeeDirty(
          input.companyId,
          input.employeeId,
        );
      } catch {
        // best-effort dirty mark
      }
      return updated;
    } catch (error) {
      await rollbackIfActive(transaction, committed);
      if (error instanceof CheckoutCommandError) {
        throw error;
      }
      if (isCheckoutMessageSidUniqueViolation(error)) {
        throw new CheckoutCommandError("CHECKOUT_MESSAGE_SID_DUPLICATE");
      }
      throw error;
    }
  },

  /**
   * Atomic exit-without-arrival: revalidate assignment, INSERT attendance (null arrival)
   * + checkout fields, optional session COMPLETED. Protected by workday unique index.
   */
  async registerExitWithoutArrival(
    input: RegisterExitWithoutArrivalInput,
  ): Promise<AttendanceRecord> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    let committed = false;
    const simulationSessionId = getSimulationSessionId();

    await transaction.begin();
    try {
      if (input.sessionId && input.expectedSessionState) {
        const activeSession = await botSessionRepository.findValidActiveById(
          input.companyId,
          input.sessionId,
          transaction,
        );

        if (!activeSession || activeSession.state !== input.expectedSessionState) {
          throw new CheckoutCommandError("BOT_SESSION_STALE");
        }
      }

      const refreshed =
        await employeeWorkdayAvailabilityService.revalidateExitWithoutArrivalCandidate(
          input.companyId,
          input.employeeId,
          input.employeeWorkdayId,
          input.eligibilityAt,
          { transaction },
        );

      if (
        refreshed.kind !== "eligible" ||
        refreshed.candidate.operationId !== input.operationId
      ) {
        if (refreshed.kind === "expired") {
          throw new CheckoutCommandError("CHECKOUT_CANDIDATE_EXPIRED");
        }
        // Concurrent winner already persisted: treat as duplicate checkout, not a generic miss.
        const alreadyPresent =
          await attendanceRepository.hasActiveRecordByEmployeeWorkdayInTransaction(
            input.companyId,
            transaction,
            input.employeeWorkdayId,
            simulationSessionId ?? null,
          );
        throw new CheckoutCommandError(
          alreadyPresent ? "CHECKOUT_DUPLICATE" : "CHECKOUT_CANDIDATE_UNAVAILABLE",
        );
      }

      const created = await attendanceRepository.createExitOnlyWithCheckoutInTransaction(
        input.companyId,
        transaction,
        {
          operationId: input.operationId,
          employeeId: input.employeeId,
          employeeWorkdayId: input.employeeWorkdayId,
          validationStatus: resolveExitOnlyValidationStatus(input.fields.checkoutStatus),
          ...input.fields,
          isSimulation: Boolean(simulationSessionId),
          simulationSessionId: simulationSessionId ?? null,
        },
      );

      if (input.sessionId) {
        await botSessionRepository.updateSession(
          input.companyId,
          input.sessionId,
          { state: "COMPLETED" },
          transaction,
        );
      }

      await transaction.commit();
      committed = true;
      try {
        const { attendanceThresholdAlertService } = await import(
          "./attendance-threshold-alert.service"
        );
        await attendanceThresholdAlertService.markEmployeeDirty(
          input.companyId,
          input.employeeId,
        );
      } catch {
        // best-effort dirty mark
      }
      return created;
    } catch (error) {
      await rollbackIfActive(transaction, committed);
      if (error instanceof CheckoutCommandError) {
        throw error;
      }
      if (isCheckoutMessageSidUniqueViolation(error)) {
        throw new CheckoutCommandError("CHECKOUT_MESSAGE_SID_DUPLICATE");
      }
      if (isActiveAttendanceDuplicateKeyError(error)) {
        throw new CheckoutCommandError("CHECKOUT_DUPLICATE");
      }
      throw error;
    }
  },
};
