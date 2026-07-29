import type { CompanyModuleKey } from "../../types/company-module";
import type { CompanySettingsFormValues } from "../../types/company-settings";
import {
  validateCompanySettingsFields,
  type CompanySettingsFieldKey,
} from "../../utils/company-settings-validation";

/** Fields that have editable controls in the create-company dialog. */
export type CreateCompanyVisibleFieldKey =
  | "name"
  | "operationTimezone"
  | "defaultRadiusMeters"
  | "defaultOperationStartTime"
  | "defaultOperationEndTime"
  | "defaultEarlyArrivalToleranceMinutes"
  | "defaultLateArrivalToleranceMinutes"
  | "lateGraceMinutes"
  | "earlyLeaveToleranceMinutes"
  | "modules"
  | "ownerName"
  | "ownerEmail"
  | "ownerTemporaryPassword";

/** @deprecated Prefer CreateCompanyVisibleFieldKey */
export type CreatePlatformCompanyFieldKey = CreateCompanyVisibleFieldKey;

export const CREATE_PLATFORM_COMPANY_FIELD_ORDER: CreateCompanyVisibleFieldKey[] = [
  "name",
  "operationTimezone",
  "defaultRadiusMeters",
  "defaultOperationStartTime",
  "defaultOperationEndTime",
  "defaultEarlyArrivalToleranceMinutes",
  "defaultLateArrivalToleranceMinutes",
  "lateGraceMinutes",
  "earlyLeaveToleranceMinutes",
  "modules",
  "ownerName",
  "ownerEmail",
  "ownerTemporaryPassword",
];

const VISIBLE_SETTINGS_FIELDS = new Set<CompanySettingsFieldKey>([
  "operationTimezone",
  "defaultRadiusMeters",
  "defaultOperationStartTime",
  "defaultOperationEndTime",
  "defaultEarlyArrivalToleranceMinutes",
  "defaultLateArrivalToleranceMinutes",
  "lateGraceMinutes",
  "earlyLeaveToleranceMinutes",
]);

export interface CreatePlatformCompanyFormState {
  name: string;
  settings: CompanySettingsFormValues;
  modules: CompanyModuleKey[];
  ownerName: string;
  ownerEmail: string;
  ownerTemporaryPassword: string;
}

export interface CreateCompanyValidationResult {
  fieldErrors: Partial<Record<CreateCompanyVisibleFieldKey, string>>;
  formErrors: string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isCreateCompanyValidationValid(result: CreateCompanyValidationResult): boolean {
  return Object.keys(result.fieldErrors).length === 0 && result.formErrors.length === 0;
}

/**
 * Field-keyed validation for the platform “Crear empresa” dialog.
 * Overnight default schedules (e.g. 20:30–03:00) are valid HH:mm pairs — end is not required to be after start.
 * Settings keys without a visible control are returned as blocking formErrors (never discarded).
 */
export function validateCreatePlatformCompanyForm(
  state: CreatePlatformCompanyFormState,
): CreateCompanyValidationResult {
  const fieldErrors: Partial<Record<CreateCompanyVisibleFieldKey, string>> = {};
  const formErrors: string[] = [];

  if (!state.name.trim()) {
    fieldErrors.name = "El nombre de la empresa es obligatorio.";
  }

  const settingsErrors = validateCompanySettingsFields(state.settings);
  for (const [field, message] of Object.entries(settingsErrors) as Array<
    [CompanySettingsFieldKey, string]
  >) {
    if (!message) continue;
    if (VISIBLE_SETTINGS_FIELDS.has(field)) {
      fieldErrors[field as CreateCompanyVisibleFieldKey] = message;
    } else {
      formErrors.push(message);
    }
  }

  if (!state.modules.length) {
    fieldErrors.modules = "Debe habilitar al menos un módulo.";
  }

  if (!state.ownerName.trim()) {
    fieldErrors.ownerName = "El nombre del owner es obligatorio.";
  }

  if (!state.ownerEmail.trim()) {
    fieldErrors.ownerEmail = "El email del owner es obligatorio.";
  } else if (!EMAIL_PATTERN.test(state.ownerEmail.trim())) {
    fieldErrors.ownerEmail = "El email del owner no es válido.";
  }

  if (!state.ownerTemporaryPassword || state.ownerTemporaryPassword.length < 8) {
    fieldErrors.ownerTemporaryPassword =
      "La contraseña temporal del owner debe tener al menos 8 caracteres.";
  }

  return { fieldErrors, formErrors };
}

export function getFirstCreatePlatformCompanyErrorField(
  result: CreateCompanyValidationResult,
): CreateCompanyVisibleFieldKey | null {
  return CREATE_PLATFORM_COMPANY_FIELD_ORDER.find((key) => Boolean(result.fieldErrors[key])) ?? null;
}

export function countCreateCompanyFieldErrors(result: CreateCompanyValidationResult): number {
  return Object.keys(result.fieldErrors).length;
}
