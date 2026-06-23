import type { Employee } from "./employee";
import type { Store, StoreSummary } from "./store";

export type InventoryStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

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
  store: StoreSummary;
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

export type InventoryListSortField =
  | "storeName"
  | "storeAddress"
  | "scheduledStart"
  | "scheduledEnd"
  | "status"
  | "earlyToleranceMinutes"
  | "lateToleranceMinutes";

export interface InventoryFilters {
  page?: number;
  limit?: number;
  status?: InventoryStatus;
  storeId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: InventoryListSortField;
  sortDirection?: "asc" | "desc";
}

export interface CreateInventoryInput {
  storeId: string;
  scheduledStart: string;
  scheduledEnd?: string | null;
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
}

export interface UpdateInventoryInput {
  storeId?: string;
  scheduledStart?: string;
  scheduledEnd?: string | null;
  earlyToleranceMinutes?: number;
  lateToleranceMinutes?: number;
  notes?: string | null;
  status?: InventoryStatus;
}

export interface InventoryAttendanceSummaryEmployee {
  employee: Employee;
  attendance: import("./attendance").AttendanceRecord | null;
  operationalStatus: import("./attendance").OperationalStatus;
}

export interface InventoryAttendanceSummaryResponse {
  inventory: Inventory & { store: Store };
  summary: {
    assigned: number;
    checkedIn: number;
    valid: number;
    pendingReview: number;
    rejected: number;
    withoutCheckIn: number;
  };
  employees: InventoryAttendanceSummaryEmployee[];
  meta: import("./api").PaginationMeta;
}

export interface InventoryAttendanceSummaryFilters {
  page?: number;
  limit?: number;
}
