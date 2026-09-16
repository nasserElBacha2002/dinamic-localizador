export interface CompanyReportEmailRecipient {
  id: string;
  companyId: string;
  email: string;
  displayName: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateCompanyReportEmailRecipientInput = {
  email: string;
  displayName?: string | null;
  isEnabled?: boolean;
};

export type UpdateCompanyReportEmailRecipientInput = {
  email?: string;
  displayName?: string | null;
  isEnabled?: boolean;
};
