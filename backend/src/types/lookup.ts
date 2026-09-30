export interface EmployeeLookup {
  id: string;
  fullName: string;
  /**
   * Index of the comma-separated search group that produced this row.
   * Set for text searches so the UI can consume that group on select.
   */
  matchedGroupIndex?: number;
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
  scheduleMode: "SINGLE" | "MULTI_SHIFT";
}
