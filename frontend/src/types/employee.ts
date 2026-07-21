import type { EmployeeType } from "../constants/employee-types";
import type { EmployeeListSortField } from "./employee-list";
import type { EmployeeCategorySummary } from "./employee-category";

export type { EmployeeListSortField } from "./employee-list";
export {
  EMPLOYEE_LIST_SORT_FIELDS,
  EMPLOYEE_CATEGORY_FILTER_ALL,
  EMPLOYEE_CATEGORY_FILTER_NONE,
} from "./employee-list";

export interface Employee {
  id: string;
  name: string;
  documentNumber: string | null;
  phoneNumber: string;
  employeeType: EmployeeType;
  categoryId: string | null;
  category: EmployeeCategorySummary | null;
  active: boolean;
  lastWorkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFilters {
  page?: number;
  limit?: number;
  active?: boolean;
  search?: string;
  /** UUID, or "none" for uncategorized. */
  categoryId?: string;
  sortBy?: EmployeeListSortField;
  sortDirection?: "asc" | "desc";
}

export interface CreateEmployeeInput {
  name: string;
  documentNumber?: string | null;
  phoneNumber: string;
  employeeType: EmployeeType;
  categoryId?: string | null;
}

export interface UpdateEmployeeInput {
  name?: string;
  documentNumber?: string | null;
  phoneNumber?: string;
  employeeType?: EmployeeType;
  categoryId?: string | null;
  active?: boolean;
}
