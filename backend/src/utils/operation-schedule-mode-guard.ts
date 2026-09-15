import { AppError } from "../errors/app-error";
import type { OperationScheduleMode } from "../constants/operation-schedule-mode";

/**
 * Phase 1 boundary: productive writes must not create hybrid SINGLE/MULTI states.
 * - SINGLE operations: workdays/assignments must keep operation_shift_id NULL.
 * - MULTI_SHIFT operations: workdays/assignments must set operation_shift_id (Phase 2).
 * Creating catalog rows in operation_shifts without flipping schedule_mode is allowed.
 */
export const assertWorkdayShiftMatchesScheduleMode = (
  scheduleMode: OperationScheduleMode,
  operationShiftId: string | null | undefined,
): void => {
  const shiftId = operationShiftId ?? null;
  if (scheduleMode === "SINGLE" && shiftId !== null) {
    throw new AppError(
      409,
      "SHIFT_NOT_ALLOWED_FOR_SINGLE_MODE",
      "Una operación en modo SINGLE no puede materializar jornadas con turno.",
    );
  }
  if (scheduleMode === "MULTI_SHIFT" && shiftId === null) {
    throw new AppError(
      409,
      "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
      "Una operación MULTI_SHIFT requiere turno en cada jornada.",
    );
  }
};

export const assertAssignmentShiftMatchesScheduleMode = (
  scheduleMode: OperationScheduleMode,
  operationShiftId: string | null | undefined,
): void => {
  const shiftId = operationShiftId ?? null;
  if (scheduleMode === "SINGLE" && shiftId !== null) {
    throw new AppError(
      409,
      "SHIFT_NOT_ALLOWED_FOR_SINGLE_MODE",
      "Una operación en modo SINGLE no puede asignar colaboradores a un turno.",
    );
  }
  if (scheduleMode === "MULTI_SHIFT" && shiftId === null) {
    throw new AppError(
      409,
      "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
      "Una operación MULTI_SHIFT requiere turno en cada asignación.",
    );
  }
};
