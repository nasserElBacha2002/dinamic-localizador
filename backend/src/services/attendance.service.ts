import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { attendanceReviewRepository } from "../repositories/attendance-review.repository";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { inventoryEmployeeRepository } from "../repositories/inventory-employee.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { ReviewAttendanceInput } from "../schemas/attendance-review.schema";
import type { CreateAttendanceInput, ListAttendanceQuery } from "../schemas/attendance.schema";
import { auditService } from "./audit.service";
import { buildCsv } from "../utils/csv";
import { buildPaginationMeta } from "../utils/pagination";

const formatLocalDateTime = (value: string | Date | null | undefined): string => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: env.BOT_OPERATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
};

export const attendanceService = {
  async create(input: CreateAttendanceInput) {
    const inventory = await inventoryRepository.findById(input.inventoryId);
    if (!inventory) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    const employee = await employeeRepository.findById(input.employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const isAssigned = await inventoryEmployeeRepository.exists(input.inventoryId, input.employeeId);
    if (!isAssigned) {
      throw new AppError(
        409,
        "EMPLOYEE_NOT_ASSIGNED_TO_INVENTORY",
        "El empleado no está asignado al inventario",
      );
    }

    const hasActiveRecord = await attendanceRepository.hasActiveRecord(
      input.inventoryId,
      input.employeeId,
    );
    if (hasActiveRecord) {
      throw new AppError(
        409,
        "ATTENDANCE_ALREADY_EXISTS",
        "Ya existe un registro de asistencia válido o pendiente para este empleado e inventario",
      );
    }

    try {
      return await attendanceRepository.create(input);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UQ_attendance_records_source_message_sid")) {
        throw new AppError(
          409,
          "SOURCE_MESSAGE_SID_ALREADY_EXISTS",
          "El sourceMessageSid ya fue utilizado",
        );
      }

      throw error;
    }
  },

  async list(query: ListAttendanceQuery) {
    const result = await attendanceRepository.list(query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(id: string) {
    const record = await attendanceRepository.findById(id);
    if (!record) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Registro de asistencia no encontrado");
    }

    const reviews = await attendanceReviewRepository.listByAttendanceId(id);
    const technical = await this.getTechnicalDetails(record);

    return {
      ...record,
      reviews,
      technical,
    };
  },

  async getTechnicalDetails(record: {
    id: string;
    employeeId: string;
    sourceMessageSid: string | null;
    receivedLatitude: number;
    receivedLongitude: number;
    distanceMeters: number;
    validationReason: string | null;
  }) {
    const message = record.sourceMessageSid
      ? await whatsappMessageRepository.findByMessageSid(record.sourceMessageSid)
      : null;

    const employee = await employeeRepository.findById(record.employeeId);
    const session = employee
      ? await botSessionRepository.findLatestByPhone(employee.phoneNumber)
      : null;

    return {
      sourceMessageSid: record.sourceMessageSid,
      phoneNumber: employee?.phoneNumber ?? null,
      message: message
        ? {
            id: message.id,
            messageSid: message.messageSid,
            messageType: message.messageType,
            body: message.body,
            createdAt: message.createdAt,
            processingStatus: message.processingStatus,
            processingErrorCode: message.processingErrorCode,
            processedAt: message.processedAt,
          }
        : null,
      session: session
        ? {
            id: session.id,
            state: session.state,
            expiresAt: session.expiresAt,
            inventoryId: session.inventoryId,
          }
        : null,
      coordinates: {
        latitude: record.receivedLatitude,
        longitude: record.receivedLongitude,
      },
      distanceMeters: record.distanceMeters,
      validationReason: record.validationReason,
    };
  },

  async review(attendanceId: string, userId: string, input: ReviewAttendanceInput) {
    const record = await attendanceRepository.findById(attendanceId);
    if (!record) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Registro de asistencia no encontrado");
    }

    if (record.reviewedAt || (await attendanceReviewRepository.hasReview(attendanceId))) {
      throw new AppError(409, "ATTENDANCE_ALREADY_REVIEWED", "La asistencia ya fue revisada");
    }

    if (record.validationStatus !== "PENDING_REVIEW" && record.validationStatus !== "REJECTED") {
      throw new AppError(
        409,
        "ATTENDANCE_NOT_REVIEWABLE",
        "Solo se pueden revisar asistencias pendientes o rechazadas",
      );
    }

    const newValidationStatus = input.decision === "APPROVE" ? "VALID" : "REJECTED";
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const updated = await attendanceRepository.applyReview(
        {
          attendanceId,
          reviewedBy: userId,
          newValidationStatus,
          reason: input.reason,
        },
        transaction,
      );

      await attendanceReviewRepository.create(
        {
          attendanceId,
          reviewedBy: userId,
          previousValidationStatus: record.validationStatus,
          newValidationStatus,
          decision: input.decision,
          reason: input.reason,
        },
        transaction,
      );

      await transaction.commit();

      await auditService.log({
        entityType: "attendance",
        entityId: attendanceId,
        action: "review",
        previousData: {
          validationStatus: record.validationStatus,
          reviewReason: record.reviewReason,
        },
        newData: {
          validationStatus: newValidationStatus,
          reviewReason: input.reason,
          decision: input.decision,
        },
        reason: input.reason,
        userId,
      });

      return this.getById(updated.id);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async exportCsv(query: ListAttendanceQuery): Promise<string> {
    const rows = await attendanceRepository.listForExport({ ...query, page: 1, limit: 10000 });
    const csvRows = rows.map((row) => [
      String(row.employee_name ?? ""),
      row.employee_document_number ? String(row.employee_document_number) : "",
      String(row.employee_phone_number ?? ""),
      String(row.store_name ?? ""),
      row.store_address ? String(row.store_address) : "",
      String(row.inventory_id ?? ""),
      formatLocalDateTime(row.inventory_scheduled_start as string),
      formatLocalDateTime(row.received_at as string),
      row.distance_meters !== undefined ? Number(row.distance_meters) : "",
      row.store_allowed_radius_meters !== undefined ? Number(row.store_allowed_radius_meters) : "",
      String(row.validation_status ?? ""),
      String(row.location_status ?? ""),
      String(row.punctuality_status ?? ""),
      row.validation_reason ? String(row.validation_reason) : "",
      row.reviewer_name ? String(row.reviewer_name) : "",
      formatLocalDateTime(row.reviewed_at as string | null),
    ]);

    return buildCsv(
      [
        "Empleado",
        "Documento",
        "Teléfono",
        "Tienda",
        "Dirección",
        "Inventario",
        "Inicio programado",
        "Check-in",
        "Distancia",
        "Radio permitido",
        "Validación",
        "Ubicación",
        "Puntualidad",
        "Motivo",
        "Revisado por",
        "Fecha de revisión",
      ],
      csvRows,
    );
  },
};
