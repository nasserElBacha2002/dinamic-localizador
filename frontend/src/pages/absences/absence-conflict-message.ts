import { getApiErrorMessage, parseApiError } from "../../utils/errors";

export function absenceConflictUserMessage(error: unknown): string {
  const parsed = parseApiError(error);
  if (parsed.status === 403) {
    return "No tenés permiso para realizar esta acción.";
  }
  if (parsed.status === 409 || parsed.code === "ABSENCE_ALREADY_REVIEWED") {
    return (
      parsed.message ||
      "La solicitud cambió de estado. Recargá el detalle e intentá de nuevo."
    );
  }
  return getApiErrorMessage(error);
}
