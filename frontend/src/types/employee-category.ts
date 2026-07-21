export interface EmployeeCategory {
  id: string;
  companyId: string | null;
  name: string;
  normalizedName: string;
  isSystem: boolean;
  isActive: boolean;
  assignedEmployeesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeCategorySummary {
  id: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
}

export interface CreateEmployeeCategoryInput {
  name: string;
}

export interface UpdateEmployeeCategoryInput {
  name?: string;
  isActive?: boolean;
}

export interface ListEmployeeCategoriesFilters {
  includeInactive?: boolean;
}
