export interface EmployeeLookup {
  id: string;
  fullName: string;
  /**
   * Index of the comma-separated search group that produced this row.
   * Present on multi/single text searches from lookups/employees.
   */
  matchedGroupIndex?: number;
  /** Present on platform-wide observability lookups. */
  companyId?: string;
  companyName?: string;
}

export interface ServiceLookup {
  id: string;
  name: string;
  address: string | null;
}

export interface OperationLookup {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  serviceName: string;
  /** Present when API returns schedule_mode (multi-shift filtering). */
  scheduleMode?: "SINGLE" | "MULTI_SHIFT";
}

export interface LookupQuery {
  search?: string;
  limit?: number;
  id?: string;
  ids?: string[];
  active?: boolean;
}
