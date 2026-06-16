import type {
  AttendanceRecord,
  AttendanceRecordWithRelations,
  Employee,
  Inventory,
  InventoryDetail,
  InventoryEmployeeAssignment,
  InventoryWithStore,
  Store,
} from "../types/domain";
import type { AttendanceReview, User } from "../types/auth";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const mapEmployeeRow = (row: Record<string, unknown>): Employee => ({
  id: String(row.id),
  name: String(row.name),
  documentNumber: row.document_number ? String(row.document_number) : null,
  phoneNumber: String(row.phone_number),
  active: Boolean(row.active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapStoreRow = (row: Record<string, unknown>): Store => ({
  id: String(row.id),
  name: String(row.name),
  address: row.address ? String(row.address) : null,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  allowedRadiusMeters: Number(row.allowed_radius_meters),
  googlePlaceId: row.google_place_id ? String(row.google_place_id) : null,
  active: Boolean(row.active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapInventoryRow = (row: Record<string, unknown>): Inventory => ({
  id: String(row.id),
  storeId: String(row.store_id),
  scheduledStart: toIsoString(row.scheduled_start as Date | string),
  scheduledEnd: row.scheduled_end ? toIsoString(row.scheduled_end as Date | string) : null,
  earlyToleranceMinutes: Number(row.early_tolerance_minutes),
  lateToleranceMinutes: Number(row.late_tolerance_minutes),
  status: String(row.status) as Inventory["status"],
  notes: row.notes ? String(row.notes) : null,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const mapInventoryWithStoreRow = (row: Record<string, unknown>): InventoryWithStore => ({
  ...mapInventoryRow(row),
  store: {
    id: String(row.store_id),
    name: String(row.store_name),
    address: row.store_address ? String(row.store_address) : null,
    active: Boolean(row.store_active),
  },
  assignedEmployeesCount: row.assigned_employees_count
    ? Number(row.assigned_employees_count)
    : undefined,
  attendanceRecordsCount: row.attendance_records_count
    ? Number(row.attendance_records_count)
    : undefined,
});

export const mapInventoryDetail = (
  inventory: Inventory,
  store: Store,
  assignedEmployees: Employee[],
  attendanceRecordsCount: number,
): InventoryDetail => ({
  ...inventory,
  store,
  assignedEmployees,
  attendanceRecordsCount,
});

export const mapAssignmentRow = (row: Record<string, unknown>): InventoryEmployeeAssignment => ({
  inventoryId: String(row.inventory_id),
  employeeId: String(row.employee_id),
  assignedAt: toIsoString(row.assigned_at as Date | string),
  employee: row.employee_name
    ? {
        id: String(row.employee_id),
        name: String(row.employee_name),
        documentNumber: row.employee_document_number
          ? String(row.employee_document_number)
          : null,
        phoneNumber: String(row.employee_phone_number),
        active: Boolean(row.employee_active),
        createdAt: toIsoString(row.employee_created_at as Date | string),
        updatedAt: toIsoString(row.employee_updated_at as Date | string),
      }
    : undefined,
});

export const mapAttendanceRow = (row: Record<string, unknown>): AttendanceRecord => ({
  id: String(row.id),
  inventoryId: String(row.inventory_id),
  employeeId: String(row.employee_id),
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
  inventory: {
    id: String(row.inventory_id),
    status: String(row.inventory_status) as Inventory["status"],
    scheduledStart: toIsoString(row.inventory_scheduled_start as Date | string),
    scheduledEnd: row.inventory_scheduled_end
      ? toIsoString(row.inventory_scheduled_end as Date | string)
      : null,
  },
  store: {
    id: String(row.store_id),
    name: String(row.store_name),
    address: row.store_address ? String(row.store_address) : null,
    allowedRadiusMeters:
      row.store_allowed_radius_meters !== undefined && row.store_allowed_radius_meters !== null
        ? Number(row.store_allowed_radius_meters)
        : undefined,
  },
});

export const mapBotSessionRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  employeeId: String(row.employee_id),
  inventoryId: row.inventory_id ? String(row.inventory_id) : null,
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
