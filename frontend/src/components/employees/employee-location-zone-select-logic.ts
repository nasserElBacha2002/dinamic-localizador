import { normalizeLocationZoneName } from "../../utils/normalize-location-zone-name";

export function shouldOfferLocationZoneCreate(input: {
  input: string;
  zoneLabels: string[];
  canCreate: boolean;
  catalogReady: boolean;
  createPending: boolean;
}): boolean {
  const trimmed = input.input.trim();
  if (!input.canCreate || !input.catalogReady || !trimmed || input.createPending) {
    return false;
  }

  const normalizedInput = normalizeLocationZoneName(trimmed);
  const exactMatch = input.zoneLabels.some(
    (label) => normalizeLocationZoneName(label) === normalizedInput,
  );
  return !exactMatch;
}
