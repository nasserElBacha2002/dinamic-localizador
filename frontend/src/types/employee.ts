import type { EmployeeType } from "../constants/employee-types";

export interface Employee {
  id: string;
  name: string;
  documentNumber: string | null;
  phoneNumber: string;
  employeeType: EmployeeType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFilters {
  page?: number;
  limit?: number;
  active?: boolean;
  search?: string;
}

export interface CreateEmployeeInput {
  name: string;
  documentNumber?: string | null;
  phoneNumber: string;
  employeeType: EmployeeType;
}

export interface UpdateEmployeeInput {
  name?: string;
  documentNumber?: string | null;
  phoneNumber?: string;
  employeeType?: EmployeeType;
  active?: boolean;
}
