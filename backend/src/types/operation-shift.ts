export type CompanyShiftTemplate = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  /** HH:mm:ss from SQL TIME */
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OperationShift = {
  id: string;
  companyId: string;
  operationId: string;
  templateId: string | null;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateCompanyShiftTemplateInput = {
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type CreateOperationShiftInput = {
  operationId: string;
  templateId?: string | null;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};
