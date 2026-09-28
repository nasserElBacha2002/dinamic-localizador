import type { OperationStatus } from "./operation-status";

export type ValidationStatus = "VALID" | "PENDING_REVIEW" | "REJECTED";
export type LocationStatus =
  | "INSIDE_GEOFENCE"
  | "OUTSIDE_GEOFENCE"
  | "INVALID_LOCATION"
  | "NOT_RECORDED";
export type PunctualityStatus =
  | "EARLY"
  | "ON_TIME"
  | "LATE"
  | "OUTSIDE_TIME_WINDOW"
  | "NOT_RECORDED";
export type CheckoutStatus =
  | "CHECKOUT_VALID"
  | "CHECKOUT_EARLY_WITHIN_TOLERANCE"
  | "CHECKOUT_EARLY_REVIEW"
  | "CHECKOUT_LATE_EXTRA_TIME"
  | "CHECKOUT_LOCATION_REVIEW"
  | "CHECKOUT_REJECTED";

export type OperationalStatus = "NO_CHECK_IN" | "VALID" | "PENDING_REVIEW" | "REJECTED";

export type AttendanceRegistrationSource = "WHATSAPP" | "MANUAL" | "IMPORT" | "SYSTEM";

export type ManualAttendanceKind = "CHECK_IN" | "CHECK_OUT";

export type ManualAttendanceUiStatus = "ON_TIME" | "LATE" | "ON_SCHEDULE" | "EARLY_LEAVE";

export interface AttendanceRecord {
  id: string;
  operationId: string;
  employeeId: string;
  employeeWorkdayId?: string | null;
  receivedLatitude: number | null;
  receivedLongitude: number | null;
  distanceMeters: number | null;
  validationStatus: ValidationStatus;
  locationStatus: LocationStatus;
  punctualityStatus: PunctualityStatus;
  sourceMessageSid: string | null;
  validationReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  /** Null when checkout was recorded without a prior check-in. */
  receivedAt: string | null;
  checkoutAt: string | null;
  checkoutLatitude: number | null;
  checkoutLongitude: number | null;
  checkoutDistanceMeters: number | null;
  checkoutStatus: CheckoutStatus | null;
  checkoutReviewReason: string | null;
  earlyDepartureMinutes: number | null;
  extraWorkedMinutes: number | null;
  checkoutMessageSid: string | null;
  arrivalSource: AttendanceRegistrationSource | null;
  checkoutSource: AttendanceRegistrationSource | null;
  arrivalRegisteredBy: string | null;
  arrivalRegisteredAt: string | null;
  checkoutRegisteredBy: string | null;
  checkoutRegisteredAt: string | null;
  isSimulation: boolean;
  simulationSessionId: string | null;
  createdAt: string;
}

export interface ManualAttendancePreview {
  kind: ManualAttendanceKind;
  occurredAt: string;
  uiStatus: ManualAttendanceUiStatus;
  uiStatusLabel: string;
  punctualityStatus?: PunctualityStatus;
  validationStatus?: ValidationStatus;
  checkoutStatus?: CheckoutStatus;
}

export interface ManualAttendanceCreateInput {
  kind: ManualAttendanceKind;
  operationId: string;
  employeeId: string;
  employeeWorkdayId: string;
  occurredAt: string;
  reason: string;
  comment?: string | null;
}

export interface ManualAttendanceEditInput {
  kind: ManualAttendanceKind;
  occurredAt: string;
  expectedOccurredAt: string;
  reason: string;
  comment?: string | null;
}

export interface ManualAttendancePreviewInput {
  kind: ManualAttendanceKind;
  operationId: string;
  employeeId?: string;
  employeeWorkdayId?: string;
  attendanceId?: string;
  occurredAt: string;
}

export interface AttendanceAuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  reason: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
}

export interface AttendanceEmployeeSummary {
  id: string;
  name: string;
  phoneNumber: string;
}

export interface AttendanceOperationSummary {
  id: string;
  status: OperationStatus;
  scheduledStart: string;
  scheduledEnd: string | null;
}

export interface AttendanceRecordWithRelations extends AttendanceRecord {
  employee: AttendanceEmployeeSummary;
  operation: AttendanceOperationSummary;
  service: {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
    allowedRadiusMeters?: number;
  };
  arrivalRegisteredByUser?: { id: string; name: string } | null;
  checkoutRegisteredByUser?: { id: string; name: string } | null;
}

export interface AttendanceReview {
  id: string;
  attendanceId: string;
  reviewedBy: string;
  previousValidationStatus: string;
  newValidationStatus: string;
  decision: "APPROVE" | "REJECT";
  reason: string;
  createdAt: string;
  reviewer?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AttendanceTechnicalDetails {
  sourceMessageSid: string | null;
  phoneNumber: string | null;
  message: {
    id: string;
    messageSid: string | null;
    messageType: string;
    body: string | null;
    createdAt: string;
    processingStatus: string | null;
    processingErrorCode: string | null;
    processedAt: string | null;
  } | null;
  session: {
    id: string;
    state: string;
    expiresAt: string;
    operationId: string | null;
  } | null;
  coordinates: {
    latitude: number | null;
    longitude: number | null;
  };
  distanceMeters: number | null;
  validationReason: string | null;
}

export interface AttendanceDetail extends AttendanceRecordWithRelations {
  technical: AttendanceTechnicalDetails;
}

export interface AttendanceFilters {
  page?: number;
  limit?: number;
  operationId?: string;
  employeeId?: string;
  serviceId?: string;
  operationIds?: string[];
  employeeIds?: string[];
  serviceIds?: string[];
  operationShiftId?: string;
  validationStatus?: ValidationStatus;
  locationStatus?: LocationStatus;
  punctualityStatus?: PunctualityStatus;
  checkoutStatus?: CheckoutStatus;
  openAttendance?: boolean;
  dateFrom?: string;
  dateTo?: string;
  includeSimulation?: boolean;
  simulationOnly?: boolean;
}

export interface CreateAttendanceInput {
  operationId: string;
  employeeId: string;
  receivedLatitude: number;
  receivedLongitude: number;
  receivedAt: string;
  sourceMessageSid?: string | null;
}

export interface ReviewAttendanceInput {
  decision: "APPROVE" | "REJECT";
  reason: string;
}
