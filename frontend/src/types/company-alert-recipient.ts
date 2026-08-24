export type CompanyAlertRecipient = {
  id: string;
  companyId: string;
  userId: string | null;
  phoneNumber: string;
  displayName: string | null;
  isEnabled: boolean;
  receiveOperationalAlerts: boolean;
  receiveRequestAlerts: boolean;
  receiveSecurityAlerts: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCompanyAlertRecipientInput = {
  userId?: string | null;
  phoneNumber: string;
  displayName?: string | null;
  isEnabled?: boolean;
  receiveOperationalAlerts?: boolean;
  receiveRequestAlerts?: boolean;
  receiveSecurityAlerts?: boolean;
};

export type UpdateCompanyAlertRecipientInput = Partial<CreateCompanyAlertRecipientInput>;
