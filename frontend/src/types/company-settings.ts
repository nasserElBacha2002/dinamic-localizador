export interface CompanySettings {
  companyId: string;
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UpdateCompanySettingsInput = Partial<
  Pick<
    CompanySettings,
    | "operationTimezone"
    | "defaultRadiusMeters"
    | "lateGraceMinutes"
    | "earlyLeaveToleranceMinutes"
    | "requireCheckoutLocation"
    | "allowManualAttendanceCorrections"
  >
>;

export interface CompanySettingsFormValues {
  operationTimezone: string;
  defaultRadiusMeters: string;
  lateGraceMinutes: string;
  earlyLeaveToleranceMinutes: string;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
}
