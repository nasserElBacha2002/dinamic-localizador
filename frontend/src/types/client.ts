export interface Client {
  id: string;
  companyId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ClientFilters {
  active?: boolean;
  page?: number;
  limit?: number;
}
