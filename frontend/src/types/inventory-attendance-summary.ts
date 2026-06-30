import type { PaginationMeta } from "./api";
import type { AttendanceRecord, OperationalStatus } from "./attendance";
import type { Employee } from "./employee";
import type { Inventory } from "./inventory";
import type { Store } from "./store";

export interface InventoryAttendanceSummaryEmployee {
  employee: Employee;
  attendance: AttendanceRecord | null;
  operationalStatus: OperationalStatus;
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
  meta: PaginationMeta;
}

export interface InventoryAttendanceSummaryFilters {
  page?: number;
  limit?: number;
}
