import type { TableUrlFieldMap } from "../../utils/table-url-state";

export const EMPLOYEE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
  categoryId: "all",
  sortBy: "name",
  sortOrder: "asc" as "asc" | "desc",
};

export const EMPLOYEE_TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
  categoryId: { type: "string" },
  sortBy: {
    type: "enum",
    values: ["name", "documentNumber", "phoneNumber", "category", "employeeType", "active"],
  },
  sortOrder: { type: "enum", values: ["asc", "desc"] },
} satisfies TableUrlFieldMap<typeof EMPLOYEE_TABLE_DEFAULTS>;

export const EMPLOYEE_TABLE_SORTABLE_COLUMN_KEYS = [
  "name",
  "documentNumber",
  "phoneNumber",
  "category",
  "employeeType",
  "active",
] as const;

export function buildEmployeesListApiFilters(state: typeof EMPLOYEE_TABLE_DEFAULTS) {
  return {
    page: state.page,
    limit: state.pageSize,
    search: state.search || undefined,
    active: state.active === "all" ? undefined : state.active === "true",
    categoryId:
      state.categoryId === "all" || !state.categoryId
        ? undefined
        : state.categoryId === "none"
          ? "none"
          : state.categoryId,
    sortBy: state.sortBy || undefined,
    sortDirection: state.sortOrder,
  };
}
