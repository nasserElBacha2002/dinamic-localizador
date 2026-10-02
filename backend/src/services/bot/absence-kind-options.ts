import type { CompanyModuleKey } from "../../constants/company-modules";
import {
  getAbsenceModuleBlockedMessage,
  getAssignmentConfirmationModuleBlockedMessage,
} from "../whatsapp-module-gate";
import { parseOperationSelection } from "../../utils/intent";

export type AbsenceKindOptionKey = "single_workday" | "absence" | "vacation";

export type AbsenceKindOption = {
  key: AbsenceKindOptionKey;
  label: string;
};

const KIND_DEFINITIONS: Record<AbsenceKindOptionKey, string> = {
  single_workday: "No voy a una jornada",
  absence: "Informar una ausencia",
  vacation: "Solicitar vacaciones",
};

export const ABSENCE_KIND_OPTION_KEYS = Object.keys(KIND_DEFINITIONS) as AbsenceKindOptionKey[];

export const isAbsenceKindOptionKey = (value: unknown): value is AbsenceKindOptionKey =>
  typeof value === "string" &&
  (ABSENCE_KIND_OPTION_KEYS as readonly string[]).includes(value);

export const buildAvailableAbsenceKindOptions = (
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): AbsenceKindOption[] => {
  const options: AbsenceKindOption[] = [];

  if (!getAssignmentConfirmationModuleBlockedMessage(moduleStates)) {
    options.push({ key: "single_workday", label: KIND_DEFINITIONS.single_workday });
  }

  if (!getAbsenceModuleBlockedMessage(moduleStates)) {
    options.push({ key: "absence", label: KIND_DEFINITIONS.absence });
    options.push({ key: "vacation", label: KIND_DEFINITIONS.vacation });
  }

  return options;
};

export const resolveAbsenceKindSnapshot = (value: unknown): AbsenceKindOption[] | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every(isAbsenceKindOptionKey) || new Set(value).size !== value.length) {
    return null;
  }
  return value.map((key) => ({ key, label: KIND_DEFINITIONS[key] }));
};

export const formatAbsenceKindOptionsLines = (options: readonly AbsenceKindOption[]): string[] =>
  options.map((option, index) => `${index + 1}. ${option.label}`);

export const buildAbsenceKindSelectionPrompt = (
  options: readonly AbsenceKindOption[],
): string => {
  const lines = formatAbsenceKindOptionsLines(options);
  return [
    "¿Qué necesitás informar?",
    "",
    ...lines,
    "",
    "Respondé con el número de la opción.",
  ].join("\n");
};

export const resolveAbsenceKindSelection = (
  body: string,
  options: readonly AbsenceKindOptionKey[],
): AbsenceKindOptionKey | null => {
  const selection = parseOperationSelection(body?.trim() ?? "");
  if (selection === null) {
    return null;
  }
  return options[selection - 1] ?? null;
};

export const buildInvalidAbsenceKindSelectionMessage = (
  options: readonly AbsenceKindOption[],
): string =>
  ["No encontré una opción con ese número.", "", ...formatAbsenceKindOptionsLines(options)].join(
    "\n",
  );
