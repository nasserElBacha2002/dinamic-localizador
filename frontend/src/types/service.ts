export type ServiceFormat = string;

export interface Service {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  locality: string | null;
  storeFormat: ServiceFormat | null;
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

export interface ServiceFilters {
  page?: number;
  limit?: number;
  active?: boolean;
  search?: string;
}

export interface CreateServiceInput {
  name: string;
  address?: string | null;
  neighborhood?: string | null;
  locality?: string | null;
  storeFormat?: ServiceFormat | null;
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
  storeFormat?: ServiceFormat | null;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
  googlePlaceId?: string | null;
  active?: boolean;
}
