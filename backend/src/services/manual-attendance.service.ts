import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import type { ManualAttendanceAuditAction } from "../constants/attendance-registration-source";
import { attendanceRepository } from "../repositories/attendance.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { userRepository } from "../repositories/user.repository";
import type {
  ManualAttendanceMutationInput,
  ManualAttendancePreviewInput,
} from "../schemas/manual-attendance.schema";
import type { AttendanceRecordWithRelations, PunctualityStatus } from "../types/domain";
import type { OperationWorkday } from "../types/workday";
import type { CheckoutStatus } from "../constants/checkout-status";
import { evaluatePunctuality } from "../utils/attendance-validation";
import { evaluateCheckoutTime } from "../utils/checkout-validation";
import { isActiveAttendanceDuplicateKeyError } from "../utils/attendance-duplicate-errors";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { auditService } from "./audit.service";
import { botRuntimeSettingsService } from "./bot-runtime-settings.service";
import { workdayMaterializationService } from "./workday-materialization.service";

export type ManualAttendanceUiStatus =
  | "ON_TIME"
  | "LATE"
  | "ON_SCHEDULE"
  | "EARLY_LEAVE";

const toUiArrivalStatus = (punctuality: PunctualityStatus): ManualAttendanceUiStatus => {
  if (punctuality === "LATE" || punctuality === "OUTSIDE_TIME_WINDOW") {
    return "LATE";
  }
  return "ON_TIME";
};

const toUiCheckoutStatus = (checkoutStatus: CheckoutStatus): ManualAttendanceUiStatus => {
  if (
    checkoutStatus === "CHECKOUT_EARLY_WITHIN_TOLERANCE" ||
    checkoutStatus === "CHECKOUT_EARLY_REVIEW"
  ) {
    return "EARLY_LEAVE";
  }
  return "ON_SCHEDULE";
};

const uiStatusLabel = (status: ManualAttendanceUiStatus): string => {
  switch (status) {
    case "ON_TIME":
      return "En punto";
    case "LATE":
      return "Tarde";
    case "ON_SCHEDULE":
      return "A horario";
    case "EARLY_LEAVE":
      return "Antes de hora";
    default:
      return status;
  }
};

const assertManualCorrectionsEnabled = async (companyId: string): Promise<void> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  if (!settings?.allowManualAttendanceCorrections) {
    throw new AppError(
      403,
      "MANUAL_ATTENDANCE_DISABLED",
      "Las correcciones manuales de asistencia están deshabilitadas para esta empresa.",
    );
  }
};

const resolveEmployeeWorkdayContext = async (
  companyId: string,
  operationId: string,
  employeeId: string,
) => {
  const operation = await operationRepository.findById(companyId, operationId);
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
  }

  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador no encontrado.");
  }

  const operationWorkday = await workdayMaterializationService.ensureOperationWorkday(
    companyId,
    operationId,
  );

  const isAssigned = await operationEmployeeRepository.exists(
    companyId,
    operationId,
    employeeId,
    operationWorkday.workDate,
  );
  if (!isAssigned) {
    throw new AppError(
      409,
      "EMPLOYEE_NOT_ASSIGNED_TO_OPERATION",
      "El colaborador no está asignado a la operación.",
    );
  }

  const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkday(
    companyId,
    operationId,
    employeeId,
  );

  return { operation, employee, operationWorkday, employeeWorkday };
};

const resolveScheduleForEmployeeWorkday = async (
  companyId: string,
  employeeWorkdayId: string,
): Promise<OperationWorkday> => {
  const employeeWorkday = await employeeWorkdayRepository.findById(companyId, employeeWorkdayId);
  if (!employeeWorkday) {
    throw new AppError(404, "EMPLOYEE_WORKDAY_NOT_FOUND", "Jornada del colaborador no encontrada.");
  }
  const operationWorkday = await operationWorkdayRepository.findById(
    companyId,
    employeeWorkday.operationWorkdayId,
  );
  if (!operationWorkday) {
    throw new AppError(404, "OPERATION_WORKDAY_NOT_FOUND", "Jornada de la operación no encontrada.");
  }
  return operationWorkday;
};

const computeCheckIn = async (companyId: string, schedule: OperationWorkday, occurredAt: Date) => {
  const evaluation = evaluatePunctuality(
    occurredAt,
    new Date(schedule.expectedStartAt),
    schedule.earlyToleranceMinutes,
    schedule.lateToleranceMinutes,
  );

  const validationStatus =
    evaluation.timeValidationStatus === "REJECTED"
      ? "PENDING_REVIEW"
      : evaluation.timeValidationStatus;

  return {
    punctualityStatus: evaluation.punctualityStatus,
    validationStatus: validationStatus as "VALID" | "PENDING_REVIEW" | "REJECTED",
    validationReason:
      evaluation.timeReason ??
      "Registro manual sin geolocalización (corrección administrativa).",
    uiStatus: toUiArrivalStatus(evaluation.punctualityStatus),
  };
};

const computeCheckOut = async (companyId: string, schedule: OperationWorkday, occurredAt: Date) => {
  const runtime = await botRuntimeSettingsService.getBotRuntimeSettings(companyId);
  const evaluation = evaluateCheckoutTime(
    occurredAt,
    schedule.expectedEndAt ? new Date(schedule.expectedEndAt) : null,
    runtime.earlyLeaveToleranceMinutes,
  );

  return {
    checkoutStatus: evaluation.checkoutStatus,
    earlyDepartureMinutes: evaluation.earlyDepartureMinutes,
    extraWorkedMinutes: evaluation.extraWorkedMinutes,
    checkoutReviewReason:
      evaluation.reviewReason ??
      "Registro manual de salida sin geolocalización (corrección administrativa).",
    uiStatus: toUiCheckoutStatus(evaluation.checkoutStatus),
  };
};

export const manualAttendanceService = {
  uiStatusLabel,

  async preview(companyId: string, input: ManualAttendancePreviewInput) {
    await assertManualCorrectionsEnabled(companyId);
    const occurredAt = new Date(input.occurredAt);

    if (input.kind === "CHECK_IN") {
      if (!input.employeeId && !input.attendanceId) {
        throw new AppError(400, "INVALID_INPUT", "Debe indicar employeeId o attendanceId.");
      }
      let employeeId = input.employeeId;
      let operationId = input.operationId;
      let employeeWorkdayId: string | undefined;

      if (input.attendanceId) {
        const existing = await attendanceRepository.findById(companyId, input.attendanceId);
        if (!existing) {
          throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Asistencia no encontrada.");
        }
        employeeId = existing.employeeId;
        operationId = existing.operationId;
        employeeWorkdayId = existing.employeeWorkdayId ?? undefined;
      }

      const ctx = await resolveEmployeeWorkdayContext(companyId, operationId, employeeId!);
      const schedule =
        employeeWorkdayId != null
          ? await resolveScheduleForEmployeeWorkday(companyId, employeeWorkdayId)
          : ctx.operationWorkday;
      const computed = await computeCheckIn(companyId, schedule, occurredAt);
      return {
        kind: input.kind,
        occurredAt: occurredAt.toISOString(),
        uiStatus: computed.uiStatus,
        uiStatusLabel: uiStatusLabel(computed.uiStatus),
        punctualityStatus: computed.punctualityStatus,
        validationStatus: computed.validationStatus,
      };
    }

    const attendanceId = input.attendanceId;
    let employeeId = input.employeeId;
    let operationId = input.operationId;
    let employeeWorkdayId: string | undefined;

    if (attendanceId) {
      const existing = await attendanceRepository.findById(companyId, attendanceId);
      if (!existing) {
        throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Asistencia no encontrada.");
      }
      employeeId = existing.employeeId;
      operationId = existing.operationId;
      employeeWorkdayId = existing.employeeWorkdayId ?? undefined;
    }

    if (!employeeId) {
      throw new AppError(400, "INVALID_INPUT", "Debe indicar employeeId o attendanceId.");
    }

    const ctx = await resolveEmployeeWorkdayContext(companyId, operationId, employeeId);
    const schedule =
      employeeWorkdayId != null
        ? await resolveScheduleForEmployeeWorkday(companyId, employeeWorkdayId)
        : ctx.operationWorkday;
    const computed = await computeCheckOut(companyId, schedule, occurredAt);
    return {
      kind: input.kind,
      occurredAt: occurredAt.toISOString(),
      uiStatus: computed.uiStatus,
      uiStatusLabel: uiStatusLabel(computed.uiStatus),
      checkoutStatus: computed.checkoutStatus,
    };
  },

  async create(
    companyId: string,
    actorUserId: string,
    input: ManualAttendanceMutationInput,
  ): Promise<AttendanceRecordWithRelations> {
    await assertManualCorrectionsEnabled(companyId);
    if (!input.operationId || !input.employeeId) {
      throw new AppError(
        400,
        "INVALID_INPUT",
        "Para registrar se requieren operationId y employeeId.",
      );
    }

    const actor = await userRepository.findById(actorUserId);
    if (!actor) {
      throw new AppError(403, "FORBIDDEN", "Usuario no autorizado.");
    }

    const ctx = await resolveEmployeeWorkdayContext(
      companyId,
      input.operationId,
      input.employeeId,
    );
    const occurredAt = new Date(input.occurredAt);
    const existing = await attendanceRepository.findActiveByEmployeeWorkday(
      companyId,
      ctx.employeeWorkday.id,
    );

    if (input.kind === "CHECK_IN") {
      if (existing?.receivedAt) {
        throw new AppError(
          409,
          "ARRIVAL_ALREADY_EXISTS",
          "Ya existe una llegada. Usá la acción de editar llegada.",
        );
      }

      const computed = await computeCheckIn(companyId, ctx.operationWorkday, occurredAt);
      const pool = getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        let attendanceId: string;
        if (existing) {
          const updated = await attendanceRepository.applyManualArrivalInTransaction(
            companyId,
            transaction,
            {
              attendanceId: existing.id,
              receivedAt: occurredAt.toISOString(),
              punctualityStatus: computed.punctualityStatus,
              validationStatus: computed.validationStatus,
              validationReason: computed.validationReason,
              actorUserId,
              reason: input.reason,
            },
          );
          if (!updated) {
            throw new AppError(409, "ATTENDANCE_CONFLICT", "No se pudo registrar la llegada.");
          }
          attendanceId = updated.id;
        } else {
          const created = await attendanceRepository.createManualCheckInInTransaction(
            companyId,
            transaction,
            {
              operationId: input.operationId,
              employeeId: input.employeeId,
              employeeWorkdayId: ctx.employeeWorkday.id,
              receivedAt: occurredAt.toISOString(),
              punctualityStatus: computed.punctualityStatus,
              validationStatus: computed.validationStatus,
              validationReason: computed.validationReason,
              actorUserId,
            },
          );
          attendanceId = created.id;
        }

        await auditService.log(
          companyId,
          {
            entityType: "attendance",
            entityId: attendanceId,
            action: "MANUAL_CHECK_IN" satisfies ManualAttendanceAuditAction,
            userId: actorUserId,
            reason: input.reason,
            previousData: existing
              ? {
                  receivedAt: existing.receivedAt,
                  punctualityStatus: existing.punctualityStatus,
                  validationStatus: existing.validationStatus,
                }
              : null,
            newData: {
              receivedAt: occurredAt.toISOString(),
              punctualityStatus: computed.punctualityStatus,
              validationStatus: computed.validationStatus,
              arrivalSource: "MANUAL",
              comment: input.comment ?? null,
              employeeId: input.employeeId,
              operationId: input.operationId,
              registeredAt: new Date().toISOString(),
            },
          },
          transaction,
        );

        await transaction.commit();
        const row = await attendanceRepository.findById(companyId, attendanceId);
        if (!row) {
          throw new AppError(500, "ATTENDANCE_LOAD_FAILED", "No se pudo cargar la asistencia.");
        }
        return row;
      } catch (error) {
        if (isActiveAttendanceDuplicateKeyError(error)) {
          return rollbackTransactionSafely(
            transaction,
            { operation: "manual_check_in", companyId, entityId: existing?.id },
            new AppError(
              409,
              "ATTENDANCE_ALREADY_EXISTS",
              "Ya existe un registro de asistencia para esta jornada.",
            ),
          );
        }
        return rollbackTransactionSafely(
          transaction,
          { operation: "manual_check_in", companyId, entityId: existing?.id },
          error,
        );
      }
    }

    // CHECK_OUT create
    if (existing?.checkoutAt) {
      throw new AppError(
        409,
        "CHECKOUT_ALREADY_EXISTS",
        "Ya existe una salida. Usá la acción de editar salida.",
      );
    }

    const computed = await computeCheckOut(companyId, ctx.operationWorkday, occurredAt);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      let attendanceId: string;
      if (existing) {
        const updated = await attendanceRepository.registerManualCheckoutInTransaction(
          companyId,
          transaction,
          {
            attendanceId: existing.id,
            checkoutAt: occurredAt.toISOString(),
            checkoutStatus: computed.checkoutStatus,
            checkoutReviewReason: computed.checkoutReviewReason,
            earlyDepartureMinutes: computed.earlyDepartureMinutes,
            extraWorkedMinutes: computed.extraWorkedMinutes,
            actorUserId,
          },
        );
        if (!updated) {
          throw new AppError(
            409,
            "CHECKOUT_ALREADY_EXISTS",
            "La salida ya fue registrada por otra solicitud concurrente.",
          );
        }
        attendanceId = updated.id;
      } else {
        const created = await attendanceRepository.createManualExitOnlyInTransaction(
          companyId,
          transaction,
          {
            operationId: input.operationId,
            employeeId: input.employeeId,
            employeeWorkdayId: ctx.employeeWorkday.id,
            checkoutAt: occurredAt.toISOString(),
            checkoutStatus: computed.checkoutStatus,
            checkoutReviewReason: computed.checkoutReviewReason,
            earlyDepartureMinutes: computed.earlyDepartureMinutes,
            extraWorkedMinutes: computed.extraWorkedMinutes,
            actorUserId,
          },
        );
        attendanceId = created.id;
      }

      await auditService.log(
        companyId,
        {
          entityType: "attendance",
          entityId: attendanceId,
          action: "MANUAL_CHECK_OUT" satisfies ManualAttendanceAuditAction,
          userId: actorUserId,
          reason: input.reason,
          previousData: existing
            ? {
                checkoutAt: existing.checkoutAt,
                checkoutStatus: existing.checkoutStatus,
              }
            : null,
          newData: {
            checkoutAt: occurredAt.toISOString(),
            checkoutStatus: computed.checkoutStatus,
            checkoutSource: "MANUAL",
            comment: input.comment ?? null,
            employeeId: input.employeeId,
            operationId: input.operationId,
            registeredAt: new Date().toISOString(),
          },
        },
        transaction,
      );

      await transaction.commit();
      const row = await attendanceRepository.findById(companyId, attendanceId);
      if (!row) {
        throw new AppError(500, "ATTENDANCE_LOAD_FAILED", "No se pudo cargar la asistencia.");
      }
      return row;
    } catch (error) {
      if (isActiveAttendanceDuplicateKeyError(error)) {
        return rollbackTransactionSafely(
          transaction,
          { operation: "manual_check_out", companyId, entityId: existing?.id },
          new AppError(
            409,
            "ATTENDANCE_ALREADY_EXISTS",
            "Ya existe un registro de asistencia para esta jornada.",
          ),
        );
      }
      return rollbackTransactionSafely(
        transaction,
        { operation: "manual_check_out", companyId, entityId: existing?.id },
        error,
      );
    }
  },

  async edit(
    companyId: string,
    actorUserId: string,
    attendanceId: string,
    input: ManualAttendanceMutationInput,
  ): Promise<AttendanceRecordWithRelations> {
    await assertManualCorrectionsEnabled(companyId);
    const actor = await userRepository.findById(actorUserId);
    if (!actor) {
      throw new AppError(403, "FORBIDDEN", "Usuario no autorizado.");
    }

    const existing = await attendanceRepository.findById(companyId, attendanceId);
    if (!existing) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Asistencia no encontrada.");
    }
    if (!existing.employeeWorkdayId) {
      throw new AppError(
        409,
        "ATTENDANCE_WORKDAY_MISSING",
        "La asistencia no tiene jornada asociada.",
      );
    }

    const occurredAt = new Date(input.occurredAt);
    const schedule = await resolveScheduleForEmployeeWorkday(
      companyId,
      existing.employeeWorkdayId,
    );
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      if (input.kind === "CHECK_IN") {
        if (!existing.receivedAt) {
          throw new AppError(
            409,
            "ARRIVAL_NOT_FOUND",
            "No hay llegada para editar. Usá registrar llegada.",
          );
        }
        const computed = await computeCheckIn(companyId, schedule, occurredAt);
        const updated = await attendanceRepository.applyManualArrivalInTransaction(
          companyId,
          transaction,
          {
            attendanceId,
            receivedAt: occurredAt.toISOString(),
            punctualityStatus: computed.punctualityStatus,
            validationStatus: computed.validationStatus,
            validationReason: computed.validationReason,
            actorUserId,
            reason: input.reason,
          },
        );
        if (!updated) {
          throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Asistencia no encontrada.");
        }

        await auditService.log(
          companyId,
          {
            entityType: "attendance",
            entityId: attendanceId,
            action: "MANUAL_CHECK_IN_EDIT" satisfies ManualAttendanceAuditAction,
            userId: actorUserId,
            reason: input.reason,
            previousData: {
              receivedAt: existing.receivedAt,
              punctualityStatus: existing.punctualityStatus,
              validationStatus: existing.validationStatus,
              arrivalSource: existing.arrivalSource,
            },
            newData: {
              receivedAt: occurredAt.toISOString(),
              punctualityStatus: computed.punctualityStatus,
              validationStatus: computed.validationStatus,
              arrivalSource: "MANUAL",
              comment: input.comment ?? null,
              registeredAt: new Date().toISOString(),
            },
          },
          transaction,
        );
      } else {
        if (!existing.checkoutAt) {
          throw new AppError(
            409,
            "CHECKOUT_NOT_FOUND",
            "No hay salida para editar. Usá registrar salida.",
          );
        }
        const computed = await computeCheckOut(companyId, schedule, occurredAt);
        const updated = await attendanceRepository.updateManualCheckoutInTransaction(
          companyId,
          transaction,
          {
            attendanceId,
            checkoutAt: occurredAt.toISOString(),
            checkoutStatus: computed.checkoutStatus,
            checkoutReviewReason: computed.checkoutReviewReason,
            earlyDepartureMinutes: computed.earlyDepartureMinutes,
            extraWorkedMinutes: computed.extraWorkedMinutes,
            actorUserId,
          },
        );
        if (!updated) {
          throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Asistencia no encontrada.");
        }

        await auditService.log(
          companyId,
          {
            entityType: "attendance",
            entityId: attendanceId,
            action: "MANUAL_CHECK_OUT_EDIT" satisfies ManualAttendanceAuditAction,
            userId: actorUserId,
            reason: input.reason,
            previousData: {
              checkoutAt: existing.checkoutAt,
              checkoutStatus: existing.checkoutStatus,
              checkoutSource: existing.checkoutSource,
            },
            newData: {
              checkoutAt: occurredAt.toISOString(),
              checkoutStatus: computed.checkoutStatus,
              checkoutSource: "MANUAL",
              comment: input.comment ?? null,
              registeredAt: new Date().toISOString(),
            },
          },
          transaction,
        );
      }

      await transaction.commit();
      const row = await attendanceRepository.findById(companyId, attendanceId);
      if (!row) {
        throw new AppError(500, "ATTENDANCE_LOAD_FAILED", "No se pudo cargar la asistencia.");
      }
      return row;
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "manual_attendance_edit", companyId, entityId: attendanceId },
        error,
      );
    }
  },
};
