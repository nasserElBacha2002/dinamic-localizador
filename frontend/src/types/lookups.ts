export interface EmployeeLookup {
  id: string;
  fullName: string;
}

export interface StoreLookup {
  id: string;
  name: string;
  address: string | null;
}

export interface InventoryLookup {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  storeName: string;
}

export interface LookupQuery {
  search?: string;
  limit?: number;
  id?: string;
  active?: boolean;
}
