import type { TableUrlFieldMap } from "../../utils/table-url-state";
import {
  EMPLOYEE_CATEGORY_FILTER_ALL,
  EMPLOYEE_CATEGORY_FILTER_NONE,
  EMPLOYEE_LIST_SORT_FIELDS,
  type EmployeeCategoryFilterId,
  type EmployeeListSortField,
} from "../../types/employee-list";

export const EMPLOYEE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
  categoryId: EMPLOYEE_CATEGORY_FILTER_ALL as EmployeeCategoryFilterId,
  sortBy: "name" as EmployeeListSortField,
  sortOrder: "asc" as "asc" | "desc",
};

export const EMPLOYEE_TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
  categoryId: { type: "string" },
  sortBy: {
    type: "enum",
    values: EMPLOYEE_LIST_SORT_FIELDS,
  },
  sortOrder: { type: "enum", values: ["asc", "desc"] },
} satisfies TableUrlFieldMap<typeof EMPLOYEE_TABLE_DEFAULTS>;

export const EMPLOYEE_TABLE_SORTABLE_COLUMN_KEYS = EMPLOYEE_LIST_SORT_FIELDS;

export function buildEmployeesListApiFilters(state: typeof EMPLOYEE_TABLE_DEFAULTS) {
  return {
    page: state.page,
    limit: state.pageSize,
    search: state.search || undefined,
    active: state.active === "all" ? undefined : state.active === "true",
    categoryId:
      state.categoryId === EMPLOYEE_CATEGORY_FILTER_ALL || !state.categoryId
        ? undefined
        : state.categoryId === EMPLOYEE_CATEGORY_FILTER_NONE
          ? EMPLOYEE_CATEGORY_FILTER_NONE
          : state.categoryId,
    sortBy: state.sortBy,
    sortDirection: state.sortOrder,
  };
}
