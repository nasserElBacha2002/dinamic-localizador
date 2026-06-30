export function toLocalDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function validateCoordinate(
  value: string,
  kind: "latitude" | "longitude",
): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return kind === "latitude" ? "Ingresá una latitud válida." : "Ingresá una longitud válida.";
  }

  if (kind === "latitude" && (numeric < -90 || numeric > 90)) {
    return "La latitud debe estar entre -90 y 90.";
  }

  if (kind === "longitude" && (numeric < -180 || numeric > 180)) {
    return "La longitud debe estar entre -180 y 180.";
  }

  return null;
}
