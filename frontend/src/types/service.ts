export type ServiceFormat = string;

export type ServiceListSortField =
  | "name"
  | "neighborhood"
  | "locality"
  | "serviceFormat"
  | "address"
  | "active"
  | "createdAt";

export interface Service {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  locality: string | null;
  serviceFormat: ServiceFormat | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  googlePlaceId?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceSummary {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

export interface ServiceGeoFacets {
  localities: string[];
  neighborhoodsByLocality: Record<string, string[]>;
}

export interface ServiceFilters {
  page?: number;
  limit?: number;
  active?: boolean;
  search?: string;
  serviceFormat?: string;
  locality?: string;
  neighborhood?: string;
  sortBy?: ServiceListSortField;
  sortDirection?: "asc" | "desc";
}

export interface CreateServiceInput {
  name: string;
  address?: string | null;
  neighborhood?: string | null;
  locality?: string | null;
  serviceFormat?: ServiceFormat | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters?: number;
  googlePlaceId?: string | null;
}

export interface UpdateServiceInput {
  name?: string;
  address?: string | null;
  neighborhood?: string | null;
  locality?: string | null;
  serviceFormat?: ServiceFormat | null;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
  googlePlaceId?: string | null;
  active?: boolean;
}
