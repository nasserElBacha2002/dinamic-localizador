export type StandardAbsenceTypeSeed = {
  code: string;
  name: string;
  description: string;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  deductsBalance: boolean;
  allowsHalfDay: boolean;
};

/** Canonical absence types seeded per company (matches migration 009). */
export const STANDARD_ABSENCE_TYPE_SEEDS: StandardAbsenceTypeSeed[] = [
  {
    code: "VACATION",
    name: "Vacaciones",
    description: "Licencia por vacaciones",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: true,
    allowsHalfDay: false,
  },
  {
    code: "STUDY_DAY",
    name: "Día de estudio",
    description: "Ausencia por día de estudio",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: true,
  },
  {
    code: "SICK_LEAVE",
    name: "Salud",
    description: "Ausencia por motivos de salud",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: true,
  },
  {
    code: "PERSONAL_PROCEDURE",
    name: "Trámite personal",
    description: "Ausencia por trámite personal",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: false,
  },
  {
    code: "JUSTIFIED_ABSENCE",
    name: "Ausencia justificada",
    description: "Ausencia justificada",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: false,
  },
  {
    code: "UNJUSTIFIED_ABSENCE",
    name: "Ausencia injustificada",
    description: "Ausencia injustificada",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: false,
  },
  {
    code: "SPECIAL_LEAVE",
    name: "Licencia especial",
    description: "Licencia especial",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: false,
  },
  {
    code: "OTHER",
    name: "Otro",
    description: "Otro tipo de ausencia",
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: false,
    allowsHalfDay: false,
  },
];

export const STANDARD_ABSENCE_TYPE_CODES = STANDARD_ABSENCE_TYPE_SEEDS.map((type) => type.code);

export type CompanyAbsenceDefaultSeed = {
  absenceTypeCode: string;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
};

const DEFAULT_ABSENCE_SETTING_OVERRIDES: Record<
  string,
  Pick<CompanyAbsenceDefaultSeed, "defaultAnnualDays" | "autoAssignOnEmployeeCreate">
> = {
  VACATION: { defaultAnnualDays: 14, autoAssignOnEmployeeCreate: true },
  STUDY_DAY: { defaultAnnualDays: 2.5, autoAssignOnEmployeeCreate: true },
};

export const COMPANY_ABSENCE_SETTINGS_LIMITS = {
  defaultAnnualDays: { min: 0, max: 365 },
} as const;

export function resolveDefaultCompanyAbsenceSetting(
  absenceTypeCode: string,
): Pick<CompanyAbsenceDefaultSeed, "defaultAnnualDays" | "autoAssignOnEmployeeCreate"> {
  return (
    DEFAULT_ABSENCE_SETTING_OVERRIDES[absenceTypeCode] ?? {
      defaultAnnualDays: 0,
      autoAssignOnEmployeeCreate: false,
    }
  );
}

export function buildDefaultCompanyAbsenceSettings(): CompanyAbsenceDefaultSeed[] {
  return STANDARD_ABSENCE_TYPE_SEEDS.map((type) => ({
    absenceTypeCode: type.code,
    ...resolveDefaultCompanyAbsenceSetting(type.code),
  }));
}
