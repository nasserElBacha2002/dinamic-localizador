import { EMPLOYEE_TYPES, type EmployeeType } from "../constants/employee-types";
import type {
  AttendanceRecord,
  AttendanceRecordWithRelations,
  Employee,
  Operation,
  OperationDetail,
  OperationEmployeeAssignment,
  OperationWithService,
  Service,
} from "../types/domain";
import type { AttendanceReview, User } from "../types/auth";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const toDateOnlyString = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  const isoPrefix = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (isoPrefix) {
    return isoPrefix[1];
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return text.slice(0, 10);
};

const parseEmployeeType = (value: unknown): EmployeeType => {
  const employeeType = String(value);
  return (EMPLOYEE_TYPES as readonly string[]).includes(employeeType)
    ? (employeeType as EmployeeType)
    : "fijo";
};

export const mapEmployeeRow = (row: Record<string, unknown>): Employee => ({
  id: String(row.id),
  name: String(row.name),
  documentNumber: row.document_number ? String(row.document_number) : null,
  phoneNumber: String(row.phone_number),
  employeeType: parseEmployeeType(row.employee_type),
  active: Boolean(row.active),
  lastWorkedAt: row.last_worked_at ? toIsoString(row.last_worked_at as Date | string) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

const parseServiceFormat = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const serviceFormat = String(value).trim();
  return serviceFormat.length > 0 ? serviceFormat : null;
};

export const mapServiceRow = (row: Record<string, unknown>): Service => ({
  id: String(row.id),
  name: String(row.name),
  address: row.address ? String(row.address) : null,
  neighborhood: row.neighborhood ? String(row.neighborhood) : null,
  locality: row.locality ? String(row.locality) : null,
  serviceFormat: parseServiceFormat(row.store_format),
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  allowedRadiusMeters: Number(row.allowed_radius_meters),
  googlePlaceId: row.google_place_id ? String(row.google_place_id) : null,
  active: Boolean(row.active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapOperationRow = (row: Record<string, unknown>): Operation => ({
  id: String(row.id),
  serviceId: String(row.service_id),
  operationKind: (row.operation_kind ? String(row.operation_kind) : "ONE_TIME") as Operation["operationKind"],
  scheduledStart: row.scheduled_start
    ? toIsoString(row.scheduled_start as Date | string)
    : null,
  scheduledEnd: row.scheduled_end ? toIsoString(row.scheduled_end as Date | string) : null,
  earlyToleranceMinutes: Number(row.early_tolerance_minutes),
  lateToleranceMinutes: Number(row.late_tolerance_minutes),
  status: String(row.status) as Operation["status"],
  notes: row.notes ? String(row.notes) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapOperationWithServiceRow = (row: Record<string, unknown>): OperationWithService => ({
  ...mapOperationRow(row),
  service: {
    id: String(row.service_id),
    name: String(row.service_name),
    address: row.service_address ? String(row.service_address) : null,
    active: Boolean(row.service_active),
  },
  assignedEmployeesCount: row.assigned_employees_count
    ? Number(row.assigned_employees_count)
    : undefined,
  attendanceRecordsCount: row.attendance_records_count
    ? Number(row.attendance_records_count)
    : undefined,
});

export const mapOperationDetail = (
  operation: Operation,
  service: Service,
  assignedEmployees: Employee[],
  attendanceRecordsCount: number,
): OperationDetail => ({
  ...operation,
  service,
  assignedEmployees,
  attendanceRecordsCount,
});

export const mapAssignmentRow = (row: Record<string, unknown>): OperationEmployeeAssignment => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  employeeId: String(row.employee_id),
  validFrom: toDateOnlyString(row.valid_from as Date | string),
  validUntil: row.valid_until ? toDateOnlyString(row.valid_until as Date | string) : null,
  assignedAt: toIsoString(row.assigned_at as Date | string),
  createdAt: toIsoString((row.created_at ?? row.assigned_at) as Date | string),
  updatedAt: toIsoString((row.updated_at ?? row.assigned_at) as Date | string),
  confirmationStatus: row.confirmation_status
    ? (String(row.confirmation_status) as OperationEmployeeAssignment["confirmationStatus"])
    : undefined,
  confirmedAt: row.confirmed_at ? toIsoString(row.confirmed_at as Date | string) : null,
  unavailableAt: row.unavailable_at ? toIsoString(row.unavailable_at as Date | string) : null,
  cancelledAt: row.cancelled_at ? toIsoString(row.cancelled_at as Date | string) : null,
  employee: row.employee_name
    ? {
        id: String(row.employee_id),
        name: String(row.employee_name),
        documentNumber: row.employee_document_number
          ? String(row.employee_document_number)
          : null,
        phoneNumber: String(row.employee_phone_number),
        employeeType: parseEmployeeType(row.employee_type),
        active: Boolean(row.employee_active),
        lastWorkedAt: null,
        createdAt: toIsoString(row.employee_created_at as Date | string),
        updatedAt: toIsoString(row.employee_updated_at as Date | string),
      }
    : undefined,
});

export const mapAttendanceRow = (row: Record<string, unknown>): AttendanceRecord => ({
  id: String(row.id),
  operationId: String(row.operation_id),
  employeeId: String(row.employee_id),
  employeeWorkdayId: row.employee_workday_id ? String(row.employee_workday_id) : null,
  receivedLatitude: Number(row.received_latitude),
  receivedLongitude: Number(row.received_longitude),
  distanceMeters: Number(row.distance_meters),
  validationStatus: String(row.validation_status) as AttendanceRecord["validationStatus"],
  locationStatus: String(row.location_status) as AttendanceRecord["locationStatus"],
  punctualityStatus: String(row.punctuality_status) as AttendanceRecord["punctualityStatus"],
  sourceMessageSid: row.source_message_sid ? String(row.source_message_sid) : null,
  validationReason: row.validation_reason ? String(row.validation_reason) : null,
  reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
  reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at as Date | string) : null,
  reviewReason: row.review_reason ? String(row.review_reason) : null,
  receivedAt: toIsoString(row.received_at as Date | string),
  checkoutAt: row.checkout_at ? toIsoString(row.checkout_at as Date | string) : null,
  checkoutLatitude:
    row.checkout_latitude !== null && row.checkout_latitude !== undefined
      ? Number(row.checkout_latitude)
      : null,
  checkoutLongitude:
    row.checkout_longitude !== null && row.checkout_longitude !== undefined
      ? Number(row.checkout_longitude)
      : null,
  checkoutDistanceMeters:
    row.checkout_distance_meters !== null && row.checkout_distance_meters !== undefined
      ? Number(row.checkout_distance_meters)
      : null,
  checkoutStatus: row.checkout_status
    ? (String(row.checkout_status) as AttendanceRecord["checkoutStatus"])
    : null,
  checkoutReviewReason: row.checkout_review_reason ? String(row.checkout_review_reason) : null,
  earlyDepartureMinutes:
    row.early_departure_minutes !== null && row.early_departure_minutes !== undefined
      ? Number(row.early_departure_minutes)
      : null,
  extraWorkedMinutes:
    row.extra_worked_minutes !== null && row.extra_worked_minutes !== undefined
      ? Number(row.extra_worked_minutes)
      : null,
  checkoutMessageSid: row.checkout_message_sid ? String(row.checkout_message_sid) : null,
  isSimulation: Boolean(row.is_simulation),
  simulationSessionId: row.simulation_session_id ? String(row.simulation_session_id) : null,
  createdAt: toIsoString(row.created_at as Date | string),
});

export const mapAttendanceWithRelationsRow = (
  row: Record<string, unknown>,
): AttendanceRecordWithRelations => ({
  ...mapAttendanceRow(row),
  employee: {
    id: String(row.employee_id),
    name: String(row.employee_name),
    phoneNumber: String(row.employee_phone_number),
  },
  operation: {
    id: String(row.operation_id),
    status: String(row.operation_status) as Operation["status"],
    scheduledStart: toIsoString(row.operation_scheduled_start as Date | string),
    scheduledEnd: row.operation_scheduled_end
      ? toIsoString(row.operation_scheduled_end as Date | string)
      : null,
  },
  service: {
    id: String(row.service_id),
    name: String(row.service_name),
    address: row.service_address ? String(row.service_address) : null,
    allowedRadiusMeters:
      row.service_allowed_radius_meters !== undefined && row.service_allowed_radius_meters !== null
        ? Number(row.service_allowed_radius_meters)
        : undefined,
  },
});

export const mapBotSessionRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  operationId: row.operation_id ? String(row.operation_id) : null,
  phoneNumber: String(row.phone_number),
  state: String(row.state) as import("../types/twilio.types").BotSessionState,
  contextJson: row.context_json ? String(row.context_json) : null,
  expiresAt: toIsoString(row.expires_at as Date | string),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapWhatsAppMessageRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  messageSid: row.message_sid ? String(row.message_sid) : null,
  direction: String(row.direction) as import("../types/twilio.types").WhatsAppMessageDirection,
  employeeId: row.employee_id ? String(row.employee_id) : null,
  phoneFrom: String(row.phone_from),
  phoneTo: String(row.phone_to),
  messageType: String(row.message_type) as import("../types/twilio.types").WhatsAppMessageType,
  body: row.body ? String(row.body) : null,
  latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
  longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
  status: row.status ? String(row.status) : null,
  rawPayload: row.raw_payload ? String(row.raw_payload) : null,
  processingStatus: row.processing_status
    ? (String(row.processing_status) as import("../types/twilio.types").WhatsAppMessageProcessingStatus)
    : null,
  processingErrorCode: row.processing_error_code ? String(row.processing_error_code) : null,
  processedAt: row.processed_at ? toIsoString(row.processed_at as Date | string) : null,
  createdAt: toIsoString(row.created_at as Date | string),
});

export const mapUserRow = (row: Record<string, unknown>): User => ({
  id: String(row.id),
  name: String(row.name),
  email: String(row.email),
  passwordHash: String(row.password_hash),
  role: String(row.role) as User["role"],
  isPlatformAdmin: Boolean(row.is_platform_admin),
  active: Boolean(row.active),
  lastLoginAt: row.last_login_at ? toIsoString(row.last_login_at as Date | string) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapAttendanceReviewRow = (row: Record<string, unknown>): AttendanceReview => ({
  id: String(row.id),
  attendanceId: String(row.attendance_id),
  reviewedBy: String(row.reviewed_by),
  previousValidationStatus: String(row.previous_validation_status),
  newValidationStatus: String(row.new_validation_status),
  decision: String(row.decision) as AttendanceReview["decision"],
  reason: String(row.reason),
  createdAt: toIsoString(row.created_at as Date | string),
  reviewer: row.reviewer_name
    ? {
        id: String(row.reviewed_by),
        name: String(row.reviewer_name),
        email: String(row.reviewer_email),
      }
    : undefined,
});

export const mapAbsenceTypeRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  code: String(row.code),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  requiresApproval: Boolean(row.requires_approval),
  requiresAttachment: Boolean(row.requires_attachment),
  deductsBalance: Boolean(row.deducts_balance),
  allowsHalfDay: Boolean(row.allows_half_day),
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapAbsenceRequestRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  employeeId: String(row.employee_id),
  absenceTypeId: String(row.absence_type_id),
  startDate: toDateOnlyString(row.start_date as Date | string),
  endDate: toDateOnlyString(row.end_date as Date | string),
  startPeriod: String(row.start_period) as import("../types/absence").AbsenceDayPeriod,
  endPeriod: String(row.end_period) as import("../types/absence").AbsenceDayPeriod,
  totalDays: Number(row.total_days),
  reason: String(row.reason),
  status: String(row.status) as import("../types/absence").AbsenceRequestStatus,
  requestedVia: String(row.requested_via) as import("../types/absence").AbsenceRequestedVia,
  sourceMessageSid: row.source_message_sid ? String(row.source_message_sid) : null,
  reviewedByUserId: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
  reviewedAt: row.reviewed_at ? toIsoString(row.reviewed_at as Date | string) : null,
  reviewComment: row.review_comment ? String(row.review_comment) : null,
  cancelledAt: row.cancelled_at ? toIsoString(row.cancelled_at as Date | string) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapAbsenceRequestEventRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  absenceRequestId: String(row.absence_request_id),
  eventType: String(row.event_type) as import("../types/absence").AbsenceRequestEventType,
  oldStatus: row.old_status
    ? (String(row.old_status) as import("../types/absence").AbsenceRequestStatus)
    : null,
  newStatus: row.new_status
    ? (String(row.new_status) as import("../types/absence").AbsenceRequestStatus)
    : null,
  performedByUserId: row.performed_by_user_id ? String(row.performed_by_user_id) : null,
  performedByEmployeeId: row.performed_by_employee_id
    ? String(row.performed_by_employee_id)
    : null,
  comment: row.comment ? String(row.comment) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  performerName: row.performer_name ? String(row.performer_name) : null,
});

export const mapEmployeeAbsenceBalanceRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  employeeId: String(row.employee_id),
  absenceTypeId: String(row.absence_type_id),
  year: Number(row.year),
  totalDays: Number(row.total_days),
  notes: row.notes ? String(row.notes) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});
