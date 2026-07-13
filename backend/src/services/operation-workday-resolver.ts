import { AppError } from "../errors/app-error";
import type { OperationKind } from "../constants/operation-kind";
import type { Operation } from "../types/domain";
import type { ResolvedOperationWorkday } from "../types/workday";
import { resolveWorkDateFromScheduledStart } from "../utils/work-date";

const buildCheckInWindow = (
  expectedStartAt: Date,
  earlyToleranceMinutes: number,
  lateToleranceMinutes: number,
): { checkInWindowStartAt: Date; checkInWindowEndAt: Date } => {
  const checkInWindowStartAt = new Date(
    expectedStartAt.getTime() - earlyToleranceMinutes * 60_000,
  );
  const checkInWindowEndAt = new Date(
    expectedStartAt.getTime() + lateToleranceMinutes * 60_000,
  );
  return { checkInWindowStartAt, checkInWindowEndAt };
};

export const operationWorkdayResolver = {
  resolveOneTime(operation: Operation & { operationKind?: OperationKind }, timezone: string): ResolvedOperationWorkday {
    const operationKind = operation.operationKind ?? "ONE_TIME";

    if (operationKind === "RECURRING") {
      throw new AppError(
        501,
        "RECURRING_OPERATION_NOT_SUPPORTED",
        "Las operaciones recurrentes aún no están disponibles",
      );
    }

    if (!operation.scheduledStart) {
      throw new AppError(
        400,
        "OPERATION_SCHEDULE_REQUIRED",
        "La operación ONE_TIME requiere fecha de inicio programada",
      );
    }

    const expectedStartAt = new Date(operation.scheduledStart);
    const expectedEndAt = operation.scheduledEnd ? new Date(operation.scheduledEnd) : null;
    const workDate = resolveWorkDateFromScheduledStart(expectedStartAt, timezone);
    const { checkInWindowStartAt, checkInWindowEndAt } = buildCheckInWindow(
      expectedStartAt,
      operation.earlyToleranceMinutes,
      operation.lateToleranceMinutes,
    );

    return {
      workDate,
      expectedStartAt,
      expectedEndAt,
      earlyToleranceMinutes: operation.earlyToleranceMinutes,
      lateToleranceMinutes: operation.lateToleranceMinutes,
      timezone,
      scheduleVersion: 1,
      checkInWindowStartAt,
      checkInWindowEndAt,
    };
  },
};
