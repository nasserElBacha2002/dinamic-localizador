import type { InventoryStatus } from "./inventory";

export type ValidationStatus = "VALID" | "PENDING_REVIEW" | "REJECTED";
export type LocationStatus = "INSIDE_GEOFENCE" | "OUTSIDE_GEOFENCE" | "INVALID_LOCATION";
export type PunctualityStatus = "EARLY" | "ON_TIME" | "LATE" | "OUTSIDE_TIME_WINDOW";
export type CheckoutStatus =
  | "CHECKOUT_VALID"
  | "CHECKOUT_EARLY_WITHIN_TOLERANCE"
  | "CHECKOUT_EARLY_REVIEW"
  | "CHECKOUT_LATE_EXTRA_TIME"
  | "CHECKOUT_LOCATION_REVIEW"
  | "CHECKOUT_REJECTED";

export type OperationalStatus = "NO_CHECK_IN" | "VALID" | "PENDING_REVIEW" | "REJECTED";

export interface AttendanceRecord {
  id: string;
  inventoryId: string;
  employeeId: string;
  receivedLatitude: number;
  receivedLongitude: number;
  distanceMeters: number;
  validationStatus: ValidationStatus;
  locationStatus: LocationStatus;
  punctualityStatus: PunctualityStatus;
  sourceMessageSid: string | null;
  validationReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  receivedAt: string;
  checkoutAt: string | null;
  checkoutLatitude: number | null;
  checkoutLongitude: number | null;
  checkoutDistanceMeters: number | null;
  checkoutStatus: CheckoutStatus | null;
  checkoutReviewReason: string | null;
  earlyDepartureMinutes: number | null;
  extraWorkedMinutes: number | null;
  checkoutMessageSid: string | null;
  isSimulation: boolean;
  simulationSessionId: string | null;
  createdAt: string;
}

export interface AttendanceEmployeeSummary {
  id: string;
  name: string;
  phoneNumber: string;
}

export interface AttendanceInventorySummary {
  id: string;
  status: InventoryStatus;
  scheduledStart: string;
  scheduledEnd: string | null;
}

export interface AttendanceRecordWithRelations extends AttendanceRecord {
  employee: AttendanceEmployeeSummary;
  inventory: AttendanceInventorySummary;
  store: {
    id: string;
    name: string;
    address: string | null;
    active: boolean;
    allowedRadiusMeters?: number;
  };
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
    inventoryId: string | null;
  } | null;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  distanceMeters: number;
  validationReason: string | null;
}

export interface AttendanceDetail extends AttendanceRecordWithRelations {
  technical: AttendanceTechnicalDetails;
}

export interface AttendanceFilters {
  page?: number;
  limit?: number;
  inventoryId?: string;
  employeeId?: string;
  storeId?: string;
  validationStatus?: ValidationStatus;
  locationStatus?: LocationStatus;
  punctualityStatus?: PunctualityStatus;
  dateFrom?: string;
  dateTo?: string;
  includeSimulation?: boolean;
  simulationOnly?: boolean;
}

export interface CreateAttendanceInput {
  inventoryId: string;
  employeeId: string;
  receivedLatitude: number;
  receivedLongitude: number;
  distanceMeters: number;
  validationStatus: ValidationStatus;
  locationStatus: LocationStatus;
  punctualityStatus: PunctualityStatus;
  receivedAt: string;
  sourceMessageSid?: string | null;
  validationReason?: string | null;
}

export interface ReviewAttendanceInput {
  decision: "APPROVE" | "REJECT";
  reason: string;
}
