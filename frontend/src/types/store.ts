import type { StoreFormat } from "../constants/store-formats";

export interface Store {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  locality: string | null;
  storeFormat: StoreFormat | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  googlePlaceId?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSummary {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
}

export interface StoreFilters {
  page?: number;
  limit?: number;
  active?: boolean;
  search?: string;
}

export interface CreateStoreInput {
  name: string;
  address?: string | null;
  neighborhood?: string | null;
  locality?: string | null;
  storeFormat?: StoreFormat | null;
  latitude: number;
  longitude: number;
  allowedRadiusMeters?: number;
  googlePlaceId?: string | null;
}

export interface UpdateStoreInput {
  name?: string;
  address?: string | null;
  neighborhood?: string | null;
  locality?: string | null;
  storeFormat?: StoreFormat | null;
  latitude?: number;
  longitude?: number;
  allowedRadiusMeters?: number;
  googlePlaceId?: string | null;
  active?: boolean;
}
