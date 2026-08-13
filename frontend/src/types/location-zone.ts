export interface LocationZone {
  id: string;
  companyId: string;
  name: string;
  normalizedName: string;
  locality: string | null;
  normalizedLocality: string;
  centroidLatitude: number | null;
  centroidLongitude: number | null;
  isActive: boolean;
  assignedEmployeesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocationZoneSummary {
  id: string;
  name: string;
  locality: string | null;
  isActive: boolean;
}

export interface CreateLocationZoneInput {
  name: string;
  locality?: string | null;
  centroidLatitude?: number | null;
  centroidLongitude?: number | null;
}

export interface UpdateLocationZoneInput {
  name?: string;
  locality?: string | null;
  centroidLatitude?: number | null;
  centroidLongitude?: number | null;
  isActive?: boolean;
}

export interface ListLocationZonesFilters {
  includeInactive?: boolean;
}
