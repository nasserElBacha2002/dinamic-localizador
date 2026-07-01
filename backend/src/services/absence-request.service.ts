import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { CreateAbsenceRequestInput, ListAbsenceRequestsQuery } from "../schemas/absence-request.schema";
import type { AbsenceRequestDetail } from "../types/absence";
import { auditService } from "./audit.service";
import { absenceBalanceService } from "./absence-balance.service";
import { absenceInventoryImpactService } from "./absence-inventory-impact.service";
import {
  calculateTotalAbsenceDays,
  compareAbsenceDates,
  getTodayAbsenceDateIso,
  parseAbsenceDateInput,
} from "../utils/absence-date";
import { buildPaginationMeta } from "../utils/pagination";

const REVIEWABLE_STATUSES = ["PENDING", "NEEDS_INFO"] as const;

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

  const today = getTodayAbsenceDateIso(env.BOT_OPERATION_TIMEZONE);
  if (input.absenceTypeCode !== "SICK_LEAVE" && compareAbsenceDates(start.iso, today) < 0) {
    throw new AppError(
      400,
      "ABSENCE_START_IN_PAST",
      "No se pueden solicitar ausencias con fecha de inicio en el pasado",
    );
  }
};

const countAffectedInventoriesSafely = async (
  companyId: string,
  input: {
    employeeId: string;
    startDate: string;
    endDate: string;
  },
): Promise<number> => {
  try {
    const affectedInventories = await absenceInventoryImpactService.findAffectedInventories(
      companyId,
      input,
    );
    return affectedInventories.length;
  } catch (error) {
    console.error("[absence-request] affected inventories count failed", {
      employeeId: input.employeeId,
      startDate: input.startDate,
      endDate: input.endDate,
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
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
  await validateEmployee(companyId, input.employeeId);
  const absenceType = await validateAbsenceType(companyId, input.absenceTypeId, {
    blockIfRequiresAttachment: input.requestedVia === "WHATSAPP",
  });
  validateDates({
    startDate: input.startDate,
    endDate: input.endDate,
    absenceTypeCode: absenceType.code,
  });

  const totalDays = calculateTotalAbsenceDays({
    startDate: input.startDate,
    endDate: input.endDate,
    startPeriod: input.startPeriod,
    endPeriod: input.endPeriod,
  });

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const hasOverlap = await absenceRequestRepository.hasOverlappingRequest(
      companyId,
      input.employeeId,
      input.startDate,
      input.endDate,
      undefined,
      transaction,
    );
    if (hasOverlap) {
      throw new AppError(
        409,
        "ABSENCE_OVERLAP",
        "Ya existe una solicitud pendiente o aprobada que se superpone con estas fechas",
      );
    }

    const created = await absenceRequestRepository.create(
      companyId,
      {
        employeeId: input.employeeId,
        absenceTypeId: input.absenceTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        startPeriod: input.startPeriod,
        endPeriod: input.endPeriod,
        totalDays,
        reason: input.reason,
        requestedVia: input.requestedVia,
        sourceMessageSid: input.sourceMessageSid ?? null,
      },
      transaction,
    );

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

    await transaction.commit();

    await auditService.log(companyId, {
      entityType: "absence_request",
      entityId: created.id,
      action: "CREATED",
      newData: created as unknown as Record<string, unknown>,
      userId: input.performedByUserId ?? null,
    });

    return absenceRequestService.getById(companyId, created.id);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const absenceRequestService = {
  async list(companyId: string, query: ListAbsenceRequestsQuery) {
    const result = await absenceRequestRepository.list(companyId, query);
    const items = await Promise.all(
      result.items.map(async (item) => ({
        ...item,
        affectedInventoriesCount: await countAffectedInventoriesSafely(companyId, {
          employeeId: item.employeeId,
          startDate: item.startDate,
          endDate: item.endDate,
        }),
      })),
    );

    return {
      data: items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string): Promise<AbsenceRequestDetail> {
    const request = await absenceRequestRepository.findDetailById(companyId, id);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    const absenceType = await absenceTypeRepository.findById(companyId, request.absenceTypeId);
    const [events, affectedInventories, balanceImpact] = await Promise.all([
      absenceRequestRepository.listEvents(companyId, id),
      absenceInventoryImpactService
        .findAffectedInventories(companyId, {
          employeeId: request.employeeId,
          startDate: request.startDate,
          endDate: request.endDate,
        })
        .catch((error) => {
          console.error("[absence-request] affected inventories detail failed", {
            requestId: id,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        }),
      absenceType
        ? absenceBalanceService.getSummaryForRequest(companyId, request, absenceType).catch((error) => {
            console.error("[absence-request] balance impact failed", {
              requestId: id,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          })
        : Promise.resolve(null),
    ]);

    return {
      ...request,
      affectedInventoriesCount: affectedInventories.length,
      events,
      affectedInventories,
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

export { REVIEWABLE_STATUSES };
