import { AppError } from "../errors/app-error";
import type { OperationScheduleMode } from "../constants/operation-schedule-mode";

/**
 * Phase 1 boundary: productive writes must not create hybrid SINGLE/MULTI states.
 * - SINGLE operations: workdays/assignments must keep operation_shift_id NULL.
 * - MULTI_SHIFT operations: workdays/assignments must set operation_shift_id (Phase 2).
 * Creating catalog rows in operation_shifts without flipping schedule_mode is allowed.
 */

/**
 * Rejects MULTI_SHIFT operations in consumers that still assume one workday per date.
 * Use until Phase 3 WhatsApp / multi-aware callers are ready.
 */
export const assertSingleScheduleModeOrReject = (
  scheduleMode: OperationScheduleMode | string | null | undefined,
  contextCode = "MULTI_SHIFT_NOT_SUPPORTED_HERE",
): void => {
  if (scheduleMode === "MULTI_SHIFT") {
    throw new AppError(
      409,
      contextCode,
      "Esta acción aún no admite operaciones multi-turno. Usá el flujo de turnos o materialización multi-turno.",
    );
  }
};

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
