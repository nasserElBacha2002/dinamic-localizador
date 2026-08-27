/**
 * Maps provider / technical geocoding errors to short Spanish UI copy.
 * Keep raw provider detail in logs / admin technical fields only.
 */
export function friendlyGeocodingErrorMessage(
  raw: string | null | undefined,
): string {
  if (!raw || !raw.trim()) {
    return "No se pudieron resolver las coordenadas.";
  }

  const upper = raw.toUpperCase();

  if (upper.includes("ZERO_RESULTS")) {
    return "No se encontró una ubicación compatible.";
  }
  if (upper.includes("REJECTED_COUNTRY")) {
    return "La ubicación encontrada no pertenece a Argentina.";
  }
  if (upper.includes("REJECTED_BOUNDS") || upper.includes("REJECTED_REGION")) {
    return "La ubicación encontrada no es válida para Argentina.";
  }
  if (
    upper.includes("OVER_QUERY_LIMIT") ||
    upper.includes("RESOURCE_EXHAUSTED") ||
    /\b429\b/.test(upper)
  ) {
    return "El servicio de geocodificación está temporalmente limitado.";
  }
  if (upper.includes("TIMEOUT") || upper.includes("ABORT")) {
    return "El servicio de geocodificación no respondió a tiempo.";
  }

  return "No se pudieron resolver las coordenadas.";
}
