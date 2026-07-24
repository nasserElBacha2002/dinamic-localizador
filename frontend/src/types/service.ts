export type ServiceFormat = string;

export const SERVICE_LIST_SORT_FIELDS = [
  "name",
  "neighborhood",
  "locality",
  "serviceFormat",
  "address",
  "active",
  "createdAt",
] as const;

export type ServiceListSortField = (typeof SERVICE_LIST_SORT_FIELDS)[number];

export const SERVICE_FORMAT_MAX_LENGTH = 80;

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

/**
 * Company-global geo facets (not contextual to other list filters).
 * Includes active and inactive locations; null/empty values excluded.
 */
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
