const normalizeReply = (body: string): string =>
  body
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

const AFFIRMATIVE_REPLIES = new Set([
  "si",
  "sí",
  "confirmo",
  "confirmado",
  "voy",
  "puedo",
  "1",
  "confirmar",
  "confirmo asistencia",
  "voy a asistir",
]);

const NEGATIVE_REPLIES = new Set([
  "no",
  "no puedo",
  "no voy",
  "no estoy disponible",
  "2",
  "no puedo asistir",
]);

export type AttendanceConfirmationReplyIntent = "affirmative" | "negative" | "unknown";

export const parseAttendanceConfirmationReply = (
  body: string,
): AttendanceConfirmationReplyIntent => {
  const normalized = normalizeReply(body);
  if (!normalized) {
    return "unknown";
  }

  if (AFFIRMATIVE_REPLIES.has(normalized)) {
    return "affirmative";
  }

  if (NEGATIVE_REPLIES.has(normalized)) {
    return "negative";
  }

  return "unknown";
};
