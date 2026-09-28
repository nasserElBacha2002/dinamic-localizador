// Phase 2.3 terminology note: attendance_records remain the technical persistence model.
// Conceptually each record is operation attendance at a scheduled operation.
import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { attendanceReviewRepository } from "../repositories/attendance-review.repository";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { ReviewAttendanceInput } from "../schemas/attendance-review.schema";
import type { CreateAttendanceInput, ListAttendanceQuery } from "../schemas/attendance.schema";
import { auditService } from "./audit.service";
import { geofencePolicyResolver } from "./geofence-policy.resolver";
import { workdayMaterializationService } from "./workday-materialization.service";
import { serviceRepository } from "../repositories/service.repository";
import { evaluateAttendanceCheckIn } from "../utils/evaluate-attendance-check-in";
import { attendanceAuthoritativeClock } from "../utils/attendance-authoritative-clock";
import { buildCsv } from "../utils/csv";
import { buildPaginationMeta } from "../utils/pagination";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../utils/sql-server-errors";
import { isActiveAttendanceDuplicateKeyError, isAttendanceSourceMessageSidDuplicateKeyError } from "../utils/attendance-duplicate-errors";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { systemLogger } from "../utils/system-logs/logger";

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
  async create(companyId: string, input: CreateAttendanceInput) {
    const operation = await operationRepository.findById(companyId, input.operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const employee = await employeeRepository.findById(companyId, input.employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const service = await serviceRepository.findById(companyId, operation.serviceId);
    if (!service) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio / ubicación de la operación no encontrado");
    }
    if (!Number.isFinite(service.latitude) || !Number.isFinite(service.longitude)) {
      throw new AppError(
        409,
        "SERVICE_COORDINATES_INVALID",
        "La ubicación de la operación no tiene coordenadas válidas",
      );
    }

    const operationWorkday = await workdayMaterializationService.ensureOperationWorkday(
      companyId,
      input.operationId,
    );

    const isAssigned = await operationEmployeeRepository.exists(
      companyId,
      input.operationId,
      input.employeeId,
      operationWorkday.workDate,
    );
    if (!isAssigned) {
      throw new AppError(
        409,
        "EMPLOYEE_NOT_ASSIGNED_TO_OPERATION",
        "El empleado no está asignado a la operación",
      );
    }

    const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkday(
      companyId,
      input.operationId,
      input.employeeId,
    );

    const hasActiveRecord = await attendanceRepository.hasActiveRecordByEmployeeWorkday(
      companyId,
      employeeWorkday.id,
    );
    if (hasActiveRecord) {
      throw new AppError(
        409,
        "ATTENDANCE_ALREADY_EXISTS",
        "Ya existe un registro de asistencia válido o pendiente para este empleado y operación",
      );
    }

    const geofencePolicy = await geofencePolicyResolver.resolveForService(
      companyId,
      service.allowedRadiusMeters,
    );

    // Authoritative clock for punctuality — never client-controlled (LOC-P1-002).
    const authoritativeAt = attendanceAuthoritativeClock.now();
    const clientReportedReceivedAt = input.receivedAt;
    const clientReportedDate = new Date(clientReportedReceivedAt);
    if (Number.isNaN(clientReportedDate.getTime())) {
      throw new AppError(400, "INVALID_RECEIVED_AT", "Fecha de recepción inválida");
    }

    const evaluated = evaluateAttendanceCheckIn({
      coordinates: {
        latitude: input.receivedLatitude,
        longitude: input.receivedLongitude,
      },
      serviceCoordinates: {
        latitude: service.latitude,
        longitude: service.longitude,
      },
      geofencePolicy: {
        radiusMeters: geofencePolicy.radiusMeters,
        marginMeters: geofencePolicy.marginMeters,
      },
      authoritativeAt,
      scheduledStart: new Date(operationWorkday.expectedStartAt),
      earlyToleranceMinutes: operationWorkday.earlyToleranceMinutes,
      lateToleranceMinutes: operationWorkday.lateToleranceMinutes,
    });

    systemLogger.info({
      module: "attendance",
      event: "attendance.validation.authoritative",
      message: "Server-side attendance validation decision",
      metadata: {
        companyId,
        operationId: input.operationId,
        employeeId: input.employeeId,
        distanceMeters: Math.round(evaluated.distanceMeters),
        validationStatus: evaluated.validation.validationStatus,
        locationStatus: evaluated.validation.locationStatus,
        punctualityStatus: evaluated.validation.punctualityStatus,
        geofenceRadiusSource: geofencePolicy.radiusSource,
        geofenceMarginSource: geofencePolicy.marginSource,
        authoritativeAt: authoritativeAt.toISOString(),
        // Non-trusted client claim; not used for classification or persistence clock.
        clientReportedReceivedAt,
      },
    });

    try {
      return await attendanceRepository.create(companyId, {
        operationId: input.operationId,
        employeeId: input.employeeId,
        receivedLatitude: input.receivedLatitude,
        receivedLongitude: input.receivedLongitude,
        // Persist server clock as the authoritative check-in timestamp.
        receivedAt: authoritativeAt.toISOString(),
        sourceMessageSid: input.sourceMessageSid ?? null,
        employeeWorkdayId: employeeWorkday.id,
        distanceMeters: evaluated.distanceMeters,
        validationStatus: evaluated.validation.validationStatus,
        locationStatus: evaluated.validation.locationStatus,
        punctualityStatus: evaluated.validation.punctualityStatus,
        validationReason: evaluated.validation.validationReason,
      });
    } catch (error) {
      if (isAttendanceSourceMessageSidDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "SOURCE_MESSAGE_SID_ALREADY_EXISTS",
          "El sourceMessageSid ya fue utilizado",
        );
      }

      if (isActiveAttendanceDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "ATTENDANCE_ALREADY_EXISTS",
          "Ya existe un registro de asistencia válido o pendiente para este empleado y operación",
        );
      }

      throw error;
    }
  },

  async list(companyId: string, query: ListAttendanceQuery) {
    const result = await attendanceRepository.list(companyId, query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string) {
    const record = await attendanceRepository.findById(companyId, id);
    if (!record) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Registro de asistencia no encontrado");
    }

    const technical = await this.getTechnicalDetails(companyId, record);

    return {
      ...record,
      technical,
    };
  },

  async listReviews(companyId: string, attendanceId: string, page: number, limit: number) {
    const record = await attendanceRepository.findById(companyId, attendanceId);
    if (!record) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Registro de asistencia no encontrado");
    }

    const result = await attendanceReviewRepository.listByAttendanceIdPaginated(
      companyId,
      attendanceId,
      page,
      limit,
    );

    return {
      data: result.items,
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async listAuditLogs(companyId: string, attendanceId: string, page: number, limit: number) {
    const record = await attendanceRepository.findById(companyId, attendanceId);
    if (!record) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Registro de asistencia no encontrado");
    }

    const result = await auditService.listByEntity(
      companyId,
      "attendance",
      attendanceId,
      page,
      limit,
    );

    return {
      data: result.items,
      meta: buildPaginationMeta(page, limit, result.total),
    };
  },

  async getTechnicalDetails(
    companyId: string,
    record: {
      id: string;
      employeeId: string;
      sourceMessageSid: string | null;
      receivedLatitude: number | null;
      receivedLongitude: number | null;
      distanceMeters: number | null;
      validationReason: string | null;
    },
  ) {
    const message = record.sourceMessageSid
      ? await whatsappMessageRepository.findByMessageSid(companyId, record.sourceMessageSid)
      : null;

    const employee = await employeeRepository.findById(companyId, record.employeeId);
    const session = employee
      ? await botSessionRepository.findLatestByPhone(companyId, employee.phoneNumber)
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
            operationId: session.operationId,
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

  async review(companyId: string, attendanceId: string, userId: string, input: ReviewAttendanceInput) {
    const record = await attendanceRepository.findById(companyId, attendanceId);
    if (!record) {
      throw new AppError(404, "ATTENDANCE_NOT_FOUND", "Registro de asistencia no encontrado");
    }

    if (record.reviewedAt || (await attendanceReviewRepository.hasReview(companyId, attendanceId))) {
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
        companyId,
        {
          attendanceId,
          reviewedBy: userId,
          newValidationStatus,
          reason: input.reason,
        },
        transaction,
      );

      if (!updated) {
        throw new AppError(409, "ATTENDANCE_ALREADY_REVIEWED", "La asistencia ya fue revisada");
      }

      await attendanceReviewRepository.create(
        companyId,
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

      // CRITICAL_AUDIT: same TX as business mutation + attendance_reviews history.
      await auditService.log(
        companyId,
        {
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
        },
        transaction,
      );

      await transaction.commit();

      return this.getById(companyId, updated.id);
    } catch (error) {
      if (
        isDuplicateKeyError(error) &&
        (getDuplicateKeyConstraint(error)?.includes("attendance_reviews") ||
          getDuplicateKeyConstraint(error) === "UQ_attendance_reviews_company_attendance")
      ) {
        const alreadyReviewed = new AppError(
          409,
          "ATTENDANCE_ALREADY_REVIEWED",
          "La asistencia ya fue revisada",
        );
        return rollbackTransactionSafely(
          transaction,
          { operation: "attendance.review", companyId, entityId: attendanceId },
          alreadyReviewed,
        );
      }
      return rollbackTransactionSafely(
        transaction,
        { operation: "attendance.review", companyId, entityId: attendanceId },
        error,
      );
    }
  },

  async exportCsv(companyId: string, query: ListAttendanceQuery): Promise<string> {
    const rows = await attendanceRepository.listForExport(companyId, { ...query, page: 1, limit: 10000 });
    const csvRows = rows.map((row) => [
      String(row.employee_name ?? ""),
      row.employee_document_number ? String(row.employee_document_number) : "",
      String(row.employee_phone_number ?? ""),
      String(row.service_name ?? ""),
      row.service_address ? String(row.service_address) : "",
      String(row.operation_id ?? ""),
      formatLocalDateTime(row.operation_scheduled_start as string),
      row.operation_shift_id ? String(row.operation_shift_id) : "",
      row.shift_code_snapshot ? String(row.shift_code_snapshot) : "",
      row.shift_name_snapshot ? String(row.shift_name_snapshot) : "",
      formatLocalDateTime(row.received_at as string),
      row.distance_meters !== undefined ? Number(row.distance_meters) : "",
      row.service_allowed_radius_meters !== undefined ? Number(row.service_allowed_radius_meters) : "",
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
        "Servicio",
        "Dirección",
        "Operación",
        "Inicio programado",
        "Turno ID",
        "Código de turno",
        "Nombre de turno",
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
