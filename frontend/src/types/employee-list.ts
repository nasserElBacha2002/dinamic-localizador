export const EMPLOYEE_LIST_SORT_FIELDS = [
  "name",
  "documentNumber",
  "phoneNumber",
  "category",
  "employeeType",
  "active",
] as const;

export type EmployeeListSortField = (typeof EMPLOYEE_LIST_SORT_FIELDS)[number];

/** Special filter value for employees without a category. */
export const EMPLOYEE_CATEGORY_FILTER_NONE = "none" as const;
export const EMPLOYEE_CATEGORY_FILTER_ALL = "all" as const;

export type EmployeeCategoryFilterId =
  | typeof EMPLOYEE_CATEGORY_FILTER_ALL
  | typeof EMPLOYEE_CATEGORY_FILTER_NONE
  | (string & {});
