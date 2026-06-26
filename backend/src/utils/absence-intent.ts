import { normalizeIntentText } from "./intent";

export type AbsenceIntentMatch = {
  code:
    | "VACATION"
    | "STUDY_DAY"
    | "SICK_LEAVE"
    | "PERSONAL_PROCEDURE"
    | "JUSTIFIED_ABSENCE"
    | "UNJUSTIFIED_ABSENCE"
    | "SPECIAL_LEAVE"
    | "OTHER"
    | "GENERIC";
};

const ABSENCE_KEYWORDS = [
  "pedir ausencia",
  "solicitar ausencia",
  "voy a faltar",
  "voy a ausentarme",
  "ausencia",
  "licencia",
  "faltar",
  "vacaciones",
  "vacacion",
  "enfermedad",
  "estudio",
  "tramite",
] as const;

const TYPE_HINTS: Array<{ code: AbsenceIntentMatch["code"]; phrases: string[] }> = [
  { code: "VACATION", phrases: ["vacaciones", "vacacion"] },
  { code: "STUDY_DAY", phrases: ["dia de estudio", "día de estudio", "estudio"] },
  { code: "SICK_LEAVE", phrases: ["salud", "enfermedad", "enfermo", "medico", "médico"] },
  { code: "PERSONAL_PROCEDURE", phrases: ["tramite", "trámite", "tramite personal"] },
  { code: "JUSTIFIED_ABSENCE", phrases: ["ausencia justificada", "justificada"] },
  { code: "UNJUSTIFIED_ABSENCE", phrases: ["ausencia injustificada", "injustificada"] },
  { code: "SPECIAL_LEAVE", phrases: ["licencia especial", "especial"] },
];

export const isAbsenceIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return ABSENCE_KEYWORDS.some(
    (keyword) => normalized === keyword || normalized.includes(keyword),
  );
};

export const detectAbsenceTypeCode = (body: string): AbsenceIntentMatch["code"] | null => {
  const normalized = normalizeIntentText(body);

  for (const hint of TYPE_HINTS) {
    if (hint.phrases.some((phrase) => normalized.includes(phrase))) {
      return hint.code;
    }
  }

  if (isAbsenceIntent(body)) {
    return "GENERIC";
  }

  return null;
};

export const isAbsenceCancelIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return normalized === "cancelar" || normalized.startsWith("cancelar ");
};

export const isAffirmativeConfirmation = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return ["si", "sí", "confirmo", "confirmar", "ok", "dale"].includes(normalized);
};

export const isNegativeConfirmation = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return ["no", "cancelar", "rechazar"].includes(normalized);
};
