export interface CompanyLocationType {
  id: string;
  companyId: string;
  clientId: string | null;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyLocationTypeInput {
  name: string;
  code?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCompanyLocationTypeInput {
  name?: string;
  code?: string;
  sortOrder?: number;
  isActive?: boolean;
}
