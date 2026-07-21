import type { EmployeeType } from "../constants/employee-types";
import type { EmployeeCategorySummary } from "./employee-category";

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
  categoryId?: string;
  sortBy?: string;
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
