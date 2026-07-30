import sql from "mssql";
import {
  ABSENCE_ADMIN_EDITABLE_STATUSES,
  assertAbsenceTransition,
  isAbsenceAdminEditableStatus,
} from "../constants/absence-transitions";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type {
  CreateAbsenceRequestInput,
  ListAbsenceRequestsQuery,
  UpdateNeedsInfoAbsenceRequestInput,
} from "../schemas/absence-request.schema";
import type { AbsenceDayPeriod, AbsenceRequestDetail } from "../types/absence";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import {
  compareAbsenceDates,
  getTodayAbsenceDateIso,
  parseAbsenceDateInput,
} from "../utils/absence-date";
import { buildPaginationMeta } from "../utils/pagination";
import { auditService } from "./audit.service";
import { absenceBalanceService } from "./absence-balance.service";
import { absenceCalendarService } from "./absence-calendar.service";
import { absenceOperationImpactService } from "./absence-operation-impact.service";
import { absenceWorkdaySyncService } from "./absence-workday-sync.service";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";

const resolveCompanyTimezone = (companyId: string) =>
  absenceOperationImpactService.getOperationTimezone(companyId);

const validateEmployee = async (companyId: string, employeeId: string) => {
  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
  }
  if (!employee.active) {
    throw new AppError(409, "EMPLOYEE_INACTIVE", "El empleado no está activo");
  }
  return employee;
};

const validateAbsenceType = async (
  companyId: string,
  absenceTypeId: string,
  options?: { blockIfRequiresAttachment?: boolean },
) => {
  const absenceType = await absenceTypeRepository.findById(companyId, absenceTypeId);
  if (!absenceType || !absenceType.isActive) {
    throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
  }
  if (options?.blockIfRequiresAttachment && absenceType.requiresAttachment) {
    throw new AppError(
      409,
      "ABSENCE_ATTACHMENT_REQUIRED",
      "Este tipo de ausencia requiere adjunto y aún no está disponible por WhatsApp",
    );
  }
  return absenceType;
};

const validateDates = (input: {
  startDate: string;
  endDate: string;
  absenceTypeCode: string;
  timezone: string;
}) => {
  const start = parseAbsenceDateInput(input.startDate);
  const end = parseAbsenceDateInput(input.endDate);
  if (!start || !end) {
    throw new AppError(400, "INVALID_ABSENCE_DATE", "Formato de fecha inválido");
  }
  if (compareAbsenceDates(start.iso, end.iso) > 0) {
    throw new AppError(
      400,
      "INVALID_ABSENCE_DATE_RANGE",
      "La fecha de inicio no puede ser posterior a la fecha de fin",
    );
  }

  const today = getTodayAbsenceDateIso(input.timezone);
  if (input.absenceTypeCode !== "SICK_LEAVE" && compareAbsenceDates(start.iso, today) < 0) {
    throw new AppError(
      400,
      "ABSENCE_START_IN_PAST",
      "No se pueden solicitar ausencias con fecha de inicio en el pasado",
    );
  }
};

const assertNoOverlap = async (
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeRequestId: string | undefined,
  transaction: sql.Transaction,
) => {
  const hasOverlap = await absenceRequestRepository.hasOverlappingRequest(
    companyId,
    employeeId,
    startDate,
    endDate,
    excludeRequestId,
    transaction,
  );
  if (hasOverlap) {
    throw new AppError(
      409,
      "ABSENCE_OVERLAP",
      "Ya existe una solicitud pendiente, que requiere información o aprobada que se superpone con estas fechas",
    );
  }
};

const normalizeHalfDayPeriods = (
  allowsHalfDay: boolean,
  startPeriod: AbsenceDayPeriod,
  endPeriod: AbsenceDayPeriod,
): { startPeriod: AbsenceDayPeriod; endPeriod: AbsenceDayPeriod } => {
  if (!allowsHalfDay) {
    return { startPeriod: "FULL_DAY", endPeriod: "FULL_DAY" };
  }
  return { startPeriod, endPeriod };
};

const isDuplicateSourceMessageSidError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("UQ_absence_requests_source_message_sid") ||
    error.message.includes("duplicate key"));

const createRequest = async (
  companyId: string,
  input: {
    employeeId: string;
    absenceTypeId: string;
    startDate: string;
    endDate: string;
    startPeriod: CreateAbsenceRequestInput["startPeriod"];
    endPeriod: CreateAbsenceRequestInput["endPeriod"];
    reason: string;
    requestedVia: "ADMIN" | "WHATSAPP";
    sourceMessageSid?: string | null;
    performedByUserId?: string | null;
    performedByEmployeeId?: string | null;
  },
): Promise<AbsenceRequestDetail> => {
  const timezone = await resolveCompanyTimezone(companyId);
  await validateEmployee(companyId, input.employeeId);
  const absenceType = await validateAbsenceType(companyId, input.absenceTypeId, {
    blockIfRequiresAttachment: input.requestedVia === "WHATSAPP",
  });
  validateDates({
    startDate: input.startDate,
    endDate: input.endDate,
    absenceTypeCode: absenceType.code,
    timezone,
  });

  const periods = normalizeHalfDayPeriods(
    absenceType.allowsHalfDay,
    input.startPeriod,
    input.endPeriod,
  );
  const calculation = await absenceCalendarService.calculateDuration(companyId, {
    employeeId: input.employeeId,
    absenceTypeId: input.absenceTypeId,
    startDate: input.startDate,
    endDate: input.endDate,
    startPeriod: periods.startPeriod,
    endPeriod: periods.endPeriod,
  });
  const totalDays = calculation.totalDays;
  const snapshotCalendarId =
    calculation.calendarId === "legacy" ? null : calculation.calendarId;

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let requestId = "";
  let autoApproved = false;

  try {
    await assertNoOverlap(
      companyId,
      input.employeeId,
      input.startDate,
      input.endDate,
      undefined,
      transaction,
    );

    const created = await absenceRequestRepository.create(
      companyId,
      {
        employeeId: input.employeeId,
        absenceTypeId: input.absenceTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        startPeriod: periods.startPeriod,
        endPeriod: periods.endPeriod,
        totalDays,
        reason: input.reason,
        requestedVia: input.requestedVia,
        sourceMessageSid: input.sourceMessageSid ?? null,
        calculationMode: calculation.countingMode,
        calendarId: snapshotCalendarId,
        calendarTimezone: calculation.timezone,
        calculationVersion: calculation.calculationVersion,
        calendarVersion:
          calculation.calendarId === "legacy" ? null : calculation.calendarVersion,
        calculationInputHash: calculation.calculationInputHash ?? null,
      },
      transaction,
    );
    requestId = created.id;

    await absenceRequestRepository.createEvent(
      companyId,
      {
        absenceRequestId: created.id,
        eventType: "CREATED",
        oldStatus: null,
        newStatus: "PENDING",
        performedByUserId: input.performedByUserId ?? null,
        performedByEmployeeId: input.performedByEmployeeId ?? null,
        comment: input.reason,
      },
      transaction,
    );

    if (!absenceType.requiresApproval) {
      const autoRule = assertAbsenceTransition("AUTO_APPROVE", "PENDING");
      await absenceBalanceService.ensureSufficientBalanceForApproval(
        companyId,
        {
          employeeId: created.employeeId,
          absenceTypeId: created.absenceTypeId,
          startDate: created.startDate,
          totalDays: created.totalDays,
          status: "PENDING",
        },
        transaction,
      );

      const approved = await absenceRequestRepository.updateStatus(
        companyId,
        created.id,
        {
          status: autoRule.to,
          reviewedByUserId: input.performedByUserId ?? null,
          reviewedAt: new Date(),
          reviewComment: "Aprobación automática (tipo sin revisión requerida).",
          onlyIfStatusIn: autoRule.fromStatusesForUpdate,
        },
        transaction,
      );
      if (!approved) {
        throw new AppError(
          409,
          "ABSENCE_ALREADY_REVIEWED",
          "La solicitud cambió durante la autoaprobación. Reintentá.",
        );
      }

      await absenceRequestRepository.createEvent(
        companyId,
        {
          absenceRequestId: created.id,
          eventType: autoRule.eventType,
          oldStatus: "PENDING",
          newStatus: autoRule.to,
          performedByUserId: input.performedByUserId ?? null,
          performedByEmployeeId: input.performedByEmployeeId ?? null,
          comment: "Aprobación automática (tipo sin revisión requerida).",
        },
        transaction,
      );

      await absenceWorkdaySyncService.enqueueInTransaction(
        {
          companyId,
          absenceRequestId: created.id,
          absenceStatus: autoRule.to,
          operation: "AUTO_APPROVE",
        },
        transaction,
      );
      autoApproved = true;
    }

    await auditService.log(
      companyId,
      {
        entityType: "absence_request",
        entityId: requestId,
        action: autoApproved ? "CREATED_AUTO_APPROVED" : "CREATED",
        newData: { requestId, autoApproved },
        userId: input.performedByUserId ?? null,
      },
      transaction,
    );

    await transaction.commit();
  } catch (error) {
    return rollbackTransactionSafely(
      transaction,
      { operation: "absence-request.create", companyId, entityId: requestId || undefined },
      error,
    );
  }

  if (autoApproved) {
    return absenceWorkdaySyncService.runAfterAbsenceMutation(
      companyId,
      requestId,
      () => absenceRequestService.getById(companyId, requestId),
      () =>
        employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
          companyId,
          requestId,
        ),
      "auto-approve-on-create",
    );
  }

  return absenceRequestService.getById(companyId, requestId);
};

const resolveEditablePayload = async (
  companyId: string,
  existing: {
    id: string;
    employeeId: string;
    absenceTypeId: string;
    startDate: string;
    endDate: string;
    startPeriod: AbsenceDayPeriod;
    endPeriod: AbsenceDayPeriod;
    reason: string;
  },
  input: UpdateNeedsInfoAbsenceRequestInput,
  timezone: string,
  options?: { blockIfRequiresAttachment?: boolean },
) => {
  const absenceTypeId = input.absenceTypeId ?? existing.absenceTypeId;
  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  const reason = input.reason ?? existing.reason;

  const absenceType = await validateAbsenceType(companyId, absenceTypeId, options);
  validateDates({
    startDate,
    endDate,
    absenceTypeCode: absenceType.code,
    timezone,
  });

  const periods = normalizeHalfDayPeriods(
    absenceType.allowsHalfDay,
    input.startPeriod ?? existing.startPeriod,
    input.endPeriod ?? existing.endPeriod,
  );

  const calculation = await absenceCalendarService.calculateDuration(companyId, {
    employeeId: existing.employeeId,
    absenceTypeId,
    startDate,
    endDate,
    startPeriod: periods.startPeriod,
    endPeriod: periods.endPeriod,
  });

  return {
    absenceType,
    absenceTypeId,
    startDate,
    endDate,
    startPeriod: periods.startPeriod,
    endPeriod: periods.endPeriod,
    reason,
    totalDays: calculation.totalDays,
    calculationMode: calculation.countingMode,
    calendarId: calculation.calendarId === "legacy" ? null : calculation.calendarId,
    calendarTimezone: calculation.timezone,
    calculationVersion: calculation.calculationVersion,
    calendarVersion:
      calculation.calendarId === "legacy" ? null : calculation.calendarVersion,
    calculationInputHash: calculation.calculationInputHash ?? null,
  };
};

export const absenceRequestService = {
  async list(companyId: string, query: ListAbsenceRequestsQuery) {
    const result = await absenceRequestRepository.list(companyId, query);
    const counts = await absenceOperationImpactService.countAffectedOperationsForList(
      companyId,
      result.items.map((item) => ({
        id: item.id,
        employeeId: item.employeeId,
        startDate: item.startDate,
        endDate: item.endDate,
      })),
    );

    return {
      data: result.items.map((item) => ({
        ...item,
        affectedOperationsCount: counts.get(item.id) ?? 0,
      })),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string): Promise<AbsenceRequestDetail> {
    const request = await absenceRequestRepository.findDetailById(companyId, id);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    const timezone = await resolveCompanyTimezone(companyId);
    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    const [events, affectedOperations, balanceImpact] = await Promise.all([
      absenceRequestRepository.listEvents(companyId, id),
      absenceOperationImpactService
        .findAffectedOperations(
          companyId,
          {
            employeeId: request.employeeId,
            startDate: request.startDate,
            endDate: request.endDate,
          },
          timezone,
        )
        .catch((error) => {
          console.error("[absence-request] affected operations detail failed", {
            companyId,
            requestId: id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }),
      absenceType
        ? absenceBalanceService.getSummaryForRequest(companyId, request, absenceType).catch((error) => {
            console.error("[absence-request] balance impact failed", {
              companyId,
              requestId: id,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          })
        : Promise.resolve(null),
    ]);

    return {
      ...request,
      affectedOperationsCount: affectedOperations.length,
      events,
      affectedOperations,
      balanceImpact,
    };
  },

  async createFromAdmin(companyId: string, input: CreateAbsenceRequestInput, performedByUserId: string) {
    return createRequest(companyId, {
      employeeId: input.employeeId,
      absenceTypeId: input.absenceTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      reason: input.reason,
      requestedVia: "ADMIN",
      sourceMessageSid: null,
      performedByUserId,
    });
  },

  async createFromWhatsapp(
    companyId: string,
    input: Omit<CreateAbsenceRequestInput, "requestedVia" | "sourceMessageSid"> & {
      sourceMessageSid: string;
    },
  ): Promise<{ detail: AbsenceRequestDetail; isExisting: boolean }> {
    if (input.sourceMessageSid) {
      const existing = await absenceRequestRepository.findBySourceMessageSid(
        companyId,
        input.sourceMessageSid,
      );
      if (existing) {
        return {
          detail: await this.getById(companyId, existing.id),
          isExisting: true,
        };
      }
    }

    try {
      const detail = await createRequest(companyId, {
        employeeId: input.employeeId,
        absenceTypeId: input.absenceTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod,
        reason: input.reason,
        requestedVia: "WHATSAPP",
        sourceMessageSid: input.sourceMessageSid,
        performedByEmployeeId: input.employeeId,
      });
      return { detail, isExisting: false };
    } catch (error) {
      if (input.sourceMessageSid && isDuplicateSourceMessageSidError(error)) {
        const existing = await absenceRequestRepository.findBySourceMessageSid(
          companyId,
          input.sourceMessageSid,
        );
        if (existing) {
          return {
            detail: await this.getById(companyId, existing.id),
            isExisting: true,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Admin correction path: edit fields while status is NEEDS_INFO.
   * Requires absences:review. Not an employee self-service endpoint.
   */
  async updateNeedsInfo(
    companyId: string,
    requestId: string,
    input: UpdateNeedsInfoAbsenceRequestInput,
    actorUserId: string,
  ): Promise<AbsenceRequestDetail> {
    const timezone = await resolveCompanyTimezone(companyId);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const existing = await absenceRequestRepository.findByIdForUpdate(
        companyId,
        requestId,
        transaction,
      );
      if (!existing) {
        throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
      }
      if (!isAbsenceAdminEditableStatus(existing.status)) {
        throw new AppError(
          409,
          "ABSENCE_NOT_EDITABLE",
          "Solo se pueden editar solicitudes que requieren información.",
        );
      }

      const payload = await resolveEditablePayload(companyId, existing, input, timezone);
      await assertNoOverlap(
        companyId,
        existing.employeeId,
        payload.startDate,
        payload.endDate,
        existing.id,
        transaction,
      );

      const updated = await absenceRequestRepository.updateEditableFields(
        companyId,
        requestId,
        {
          absenceTypeId: payload.absenceTypeId,
          startDate: payload.startDate,
          endDate: payload.endDate,
          startPeriod: payload.startPeriod,
          endPeriod: payload.endPeriod,
          totalDays: payload.totalDays,
          reason: payload.reason,
          calculationMode: payload.calculationMode,
          calendarId: payload.calendarId,
          calendarTimezone: payload.calendarTimezone,
          calculationVersion: payload.calculationVersion,
          calendarVersion: payload.calendarVersion,
          calculationInputHash: payload.calculationInputHash,
          onlyIfStatusIn: [...ABSENCE_ADMIN_EDITABLE_STATUSES],
        },
        transaction,
      );
      if (!updated) {
        throw new AppError(
          409,
          "ABSENCE_ALREADY_REVIEWED",
          "La solicitud cambió de estado. Recargá e intentá de nuevo.",
        );
      }

      await absenceRequestRepository.createEvent(
        companyId,
        {
          absenceRequestId: requestId,
          eventType: "UPDATED",
          oldStatus: existing.status,
          newStatus: existing.status,
          performedByUserId: actorUserId,
          comment: "Corrección administrativa mientras requiere información.",
        },
        transaction,
      );

      await auditService.log(
        companyId,
        {
          entityType: "absence_request",
          entityId: requestId,
          action: "UPDATED",
          previousData: existing as unknown as Record<string, unknown>,
          newData: updated as unknown as Record<string, unknown>,
          userId: actorUserId,
        },
        transaction,
      );

      await transaction.commit();
      return this.getById(companyId, requestId);
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-request.updateNeedsInfo", companyId, entityId: requestId },
        error,
      );
    }
  },

  /**
   * Admin resubmit: NEEDS_INFO → PENDING, then AUTO_APPROVE when type does not require approval.
   * Events are recorded as separate RESUBMITTED then APPROVED steps (alternative A).
   */
  async resubmit(companyId: string, requestId: string, actorUserId: string): Promise<AbsenceRequestDetail> {
    const timezone = await resolveCompanyTimezone(companyId);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let autoApproved = false;

    try {
      const existing = await absenceRequestRepository.findByIdForUpdate(
        companyId,
        requestId,
        transaction,
      );
      if (!existing) {
        throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
      }

      const resubmitRule = assertAbsenceTransition("RESUBMIT", existing.status);

      const absenceType = await validateAbsenceType(companyId, existing.absenceTypeId);
      validateDates({
        startDate: existing.startDate,
        endDate: existing.endDate,
        absenceTypeCode: absenceType.code,
        timezone,
      });
      await assertNoOverlap(
        companyId,
        existing.employeeId,
        existing.startDate,
        existing.endDate,
        existing.id,
        transaction,
      );

      const pending = await absenceRequestRepository.updateStatus(
        companyId,
        requestId,
        {
          status: resubmitRule.to,
          reviewedByUserId: null,
          reviewedAt: null,
          reviewComment: null,
          onlyIfStatusIn: resubmitRule.fromStatusesForUpdate,
        },
        transaction,
      );
      if (!pending) {
        throw new AppError(
          409,
          "ABSENCE_ALREADY_REVIEWED",
          "La solicitud cambió de estado. Recargá e intentá de nuevo.",
        );
      }

      await absenceRequestRepository.createEvent(
        companyId,
        {
          absenceRequestId: requestId,
          eventType: resubmitRule.eventType,
          oldStatus: existing.status,
          newStatus: resubmitRule.to,
          performedByUserId: actorUserId,
          comment: "Reenvío administrativo a pendiente.",
        },
        transaction,
      );

      if (!absenceType.requiresApproval) {
        const autoRule = assertAbsenceTransition("AUTO_APPROVE", "PENDING");
        await absenceBalanceService.ensureSufficientBalanceForApproval(
          companyId,
          pending,
          transaction,
        );
        const approved = await absenceRequestRepository.updateStatus(
          companyId,
          requestId,
          {
            status: autoRule.to,
            reviewedByUserId: actorUserId,
            reviewedAt: new Date(),
            reviewComment: "Autoaprobación tras reenvío (tipo sin revisión requerida).",
            onlyIfStatusIn: autoRule.fromStatusesForUpdate,
          },
          transaction,
        );
        if (!approved) {
          throw new AppError(
            409,
            "ABSENCE_ALREADY_REVIEWED",
            "La solicitud cambió durante la autoaprobación. Reintentá.",
          );
        }
        await absenceRequestRepository.createEvent(
          companyId,
          {
            absenceRequestId: requestId,
            eventType: autoRule.eventType,
            oldStatus: "PENDING",
            newStatus: autoRule.to,
            performedByUserId: actorUserId,
            comment: "Aprobación automática tras reenvío.",
          },
          transaction,
        );
        await absenceWorkdaySyncService.enqueueInTransaction(
          {
            companyId,
            absenceRequestId: requestId,
            absenceStatus: autoRule.to,
            operation: "RESUBMIT_AUTO_APPROVE",
          },
          transaction,
        );
        autoApproved = true;
      }

      await auditService.log(
        companyId,
        {
          entityType: "absence_request",
          entityId: requestId,
          action: autoApproved ? "RESUBMITTED_AUTO_APPROVED" : "RESUBMITTED",
          userId: actorUserId,
        },
        transaction,
      );

      await transaction.commit();
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-request.resubmit", companyId, entityId: requestId },
        error,
      );
    }

    if (autoApproved) {
      return absenceWorkdaySyncService.runAfterAbsenceMutation(
        companyId,
        requestId,
        () => this.getById(companyId, requestId),
        () =>
          employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
            companyId,
            requestId,
          ),
        "resubmit-auto-approve",
      );
    }

    return this.getById(companyId, requestId);
  },

  /** @deprecated Use createFromAdmin or createFromWhatsapp */
  async create(
    companyId: string,
    input: CreateAbsenceRequestInput,
    performedByUserId?: string | null,
  ) {
    if (input.requestedVia === "WHATSAPP") {
      if (!input.sourceMessageSid) {
        throw new AppError(400, "INVALID_SOURCE_MESSAGE_SID", "sourceMessageSid es obligatorio para WhatsApp");
      }
      const result = await this.createFromWhatsapp(companyId, {
        ...input,
        sourceMessageSid: input.sourceMessageSid,
      });
      return result.detail;
    }

    if (!performedByUserId) {
      throw new AppError(401, "UNAUTHORIZED", "Usuario no autenticado");
    }
    return this.createFromAdmin(companyId, input, performedByUserId);
  },
};
