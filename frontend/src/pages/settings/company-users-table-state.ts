import type { TableUrlFieldMap } from "../../utils/table-url-state";

export const COMPANY_USERS_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  role: "all",
  status: "all",
};

export const COMPANY_USERS_TABLE_FIELDS = {
  role: {
    type: "enum",
    values: ["all", "OWNER", "ADMIN", "OPERATOR", "VIEWER"],
  },
  status: { type: "enum", values: ["all", "ACTIVE", "INACTIVE"] },
} satisfies TableUrlFieldMap<typeof COMPANY_USERS_TABLE_DEFAULTS>;
