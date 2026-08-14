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

/** Embedded summary on employee responses (same shape as category summary). */
export interface LocationZoneSummary {
  id: string;
  name: string;
  locality: string | null;
  isActive: boolean;
}
