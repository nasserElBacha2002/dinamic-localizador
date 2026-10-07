import type { Service } from "../types/service";
import { safeText } from "./display-safe";

/** Barrio/localidad para lectura rápida en listados. */
export function formatServiceLocationSummary(service: Service): string {
  const neighborhood = service.neighborhood?.trim();
  const locality = service.locality?.trim();
  if (neighborhood && locality) {
    return `${neighborhood}, ${locality}`;
  }
  if (locality) {
    return locality;
  }
  if (neighborhood) {
    return neighborhood;
  }
  return safeText(service.address);
}
