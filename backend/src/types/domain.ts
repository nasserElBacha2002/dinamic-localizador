import type { CheckoutStatus } from "../constants/checkout-status";
import type { EmployeeType } from "../constants/employee-types";
import type { AssignmentOrigin } from "../constants/work-team-assignment";
import type { OperationKind } from "../constants/operation-kind";
import type { EmployeeCategorySummary } from "./employee-category";
import type { LocationZoneSummary } from "./location-zone";
import type { OperationScheduleSummary } from "./schedule";

export type ServiceFormat = string;

export type OperationStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
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

/** Embedded category on employee responses (scoped join). */
export type EmployeeCategoryRef = EmployeeCategorySummary;

/** Embedded approximate residence zone on employee responses. */
export type EmployeeLocationZoneRef = LocationZoneSummary;

export interface Employee {
  id: string;
  name: string;
  documentNumber: string | null;
  phoneNumber: string;
  employeeType: EmployeeType;
  categoryId: string | null;
  category: EmployeeCategoryRef | null;
  locationZoneId: string | null;
  locationZone: EmployeeLocationZoneRef | null;
  active: boolean;
  lastWorkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  locality: string | null;
  /** Shared company geographic zone (barrio+localidad). Denormalized neighborhood/locality mirror it. */
  locationZoneId: string | null;
  serviceFormat: ServiceFormat | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  googlePlaceId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Operation {
  id: string;
  serviceId: string;
  operationKind: OperationKind;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  status: OperationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OperationScheduleView {
  scheduleSource: "COMPANY" | "CUSTOM";
  validFrom: string;
  validUntil: string | null;
  timezone: string;
  version: number;
  days: import("./schedule").WeeklyScheduleDay[];
}

export interface OperationWithService extends Operation {
  service: Pick<Service, "id" | "name" | "address" | "active">;
  assignedEmployeesCount?: number;
  attendanceRecordsCount?: number;
  scheduleSummary?: OperationScheduleSummary;
}

export interface OperationDetail extends Operation {
  service: Service;
  assignedEmployees: Employee[];
  attendanceRecordsCount: number;
  schedule?: OperationScheduleView;
}

export interface OperationEmployeeAssignment {
  id: string;
  companyId: string;
  operationId: string;
  employeeId: string;
  validFrom: string;
  validUntil: string | null;
  assignedAt: string;
  createdAt: string;
  updatedAt: string;
  confirmationStatus?: "PENDING" | "CONFIRMED" | "UNAVAILABLE";
  confirmedAt?: string | null;
  unavailableAt?: string | null;
  cancelledAt?: string | null;
  lifecycleState?: "CURRENT" | "FUTURE" | "ENDED";
  assignmentOrigin?: AssignmentOrigin;
  sourceAssignmentBatchId?: string | null;
  sourceWorkTeamId?: string | null;
  sourceWorkTeamName?: string | null;
  employee?: Employee;
}

export interface AttendanceRecord {
  id: string;
  operationId: string;
  employeeId: string;
  employeeWorkdayId: string | null;
  /** Null when checkout was recorded without a prior check-in (arrival NOT_RECORDED). */
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
  /** Null when arrival was never recorded (exit-only attendance). */
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
  isSimulation: boolean;
  simulationSessionId: string | null;
  createdAt: string;
}

export interface AttendanceRecordWithRelations extends AttendanceRecord {
  employee: Pick<Employee, "id" | "name" | "phoneNumber">;
  operation: Pick<Operation, "id" | "status" | "scheduledStart" | "scheduledEnd">;
  service: Pick<Service, "id" | "name" | "address"> & { allowedRadiusMeters?: number };
}
