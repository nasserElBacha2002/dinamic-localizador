export type CompanyShiftTemplate = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  /** HH:mm */
  startTime: string;
  endTime: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Stable shift identity within an operation (Phase 2). */
export type OperationShift = {
  id: string;
  companyId: string;
  operationId: string;
  templateId: string | null;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OperationShiftVersionDay = {
  dayOfWeek: number;
  isEnabled: boolean;
};

export type OperationShiftVersion = {
  id: string;
  companyId: string;
  operationShiftId: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  startTime: string;
  endTime: string;
  days: OperationShiftVersionDay[];
  createdAt: string;
  updatedAt: string;
};

export type OperationShiftWithVersions = OperationShift & {
  versions: OperationShiftVersion[];
};

export type ShiftDateExceptionKind = "CANCEL" | "TIME_OVERRIDE" | "RESTORE";

export type OperationShiftDateException = {
  id: string;
  companyId: string;
  operationId: string;
  operationShiftId: string;
  workDate: string;
  exceptionKind: ShiftDateExceptionKind;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdByUserId: string | null;
  updatedByUserId?: string | null;
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

export type UpdateCompanyShiftTemplateInput = {
  name?: string;
  startTime?: string;
  endTime?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type CreateOperationShiftIdentityInput = {
  operationId: string;
  templateId?: string | null;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type CreateOperationShiftVersionInput = {
  effectiveFrom: string;
  effectiveUntil?: string | null;
  startTime: string;
  endTime: string;
  /** ISO weekday 1=Mon … 7=Sun. Defaults to all enabled when omitted. */
  days?: OperationShiftVersionDay[];
};

export type CreateOperationShiftWithInitialVersionInput = CreateOperationShiftIdentityInput &
  CreateOperationShiftVersionInput;

export type TransitionToMultiShiftInput = {
  effectiveFrom: string;
  shifts: Array<{
    code: string;
    name: string;
    templateId?: string | null;
    sortOrder?: number;
    startTime: string;
    endTime: string;
    effectiveUntil?: string | null;
    days?: OperationShiftVersionDay[];
    /** Explicit assignment redistribution for current SINGLE assignments. */
    assignmentIds?: string[];
  }>;
};

export type TransitionToSingleInput = {
  effectiveFrom: string;
};
