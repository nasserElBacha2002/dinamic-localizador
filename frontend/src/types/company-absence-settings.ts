export interface CompanyAbsenceSetting {
  absenceTypeCode: string;
  absenceTypeName: string;
  isActive: boolean;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
}

export interface UpdateCompanyAbsenceSettingItem {
  absenceTypeCode: string;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
}

export interface UpdateCompanyAbsenceSettingsInput {
  settings: UpdateCompanyAbsenceSettingItem[];
}
