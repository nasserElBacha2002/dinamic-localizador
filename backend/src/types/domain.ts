import type { CheckoutStatus } from "../constants/checkout-status";
import type { StoreFormat } from "../constants/store-formats";
import type { EmployeeType } from "../constants/employee-types";

export type InventoryStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ValidationStatus = "VALID" | "PENDING_REVIEW" | "REJECTED";
export type LocationStatus = "INSIDE_GEOFENCE" | "OUTSIDE_GEOFENCE" | "INVALID_LOCATION";
export type PunctualityStatus = "EARLY" | "ON_TIME" | "LATE" | "OUTSIDE_TIME_WINDOW";

export interface Employee {
  id: string;
  name: string;
  documentNumber: string | null;
  phoneNumber: string;
  employeeType: EmployeeType;
  active: boolean;
  lastWorkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  locality: string | null;
  storeFormat: StoreFormat | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  googlePlaceId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Inventory {
  id: string;
  storeId: string;
  scheduledStart: string;
  scheduledEnd: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  status: InventoryStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryWithStore extends Inventory {
  store: Pick<Store, "id" | "name" | "address" | "active">;
  assignedEmployeesCount?: number;
  attendanceRecordsCount?: number;
}

export interface InventoryDetail extends Inventory {
  store: Store;
  assignedEmployees: Employee[];
  attendanceRecordsCount: number;
}

export interface InventoryEmployeeAssignment {
  inventoryId: string;
  employeeId: string;
  assignedAt: string;
  employee?: Employee;
}

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
  createdAt: string;
}

export interface AttendanceRecordWithRelations extends AttendanceRecord {
  employee: Pick<Employee, "id" | "name" | "phoneNumber">;
  inventory: Pick<Inventory, "id" | "status" | "scheduledStart" | "scheduledEnd">;
  store: Pick<Store, "id" | "name" | "address"> & { allowedRadiusMeters?: number };
}
