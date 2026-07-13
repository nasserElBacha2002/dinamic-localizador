export interface EmployeeLookup {
  id: string;
  fullName: string;
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
}

export interface LookupQuery {
  search?: string;
  limit?: number;
  id?: string;
  active?: boolean;
}
