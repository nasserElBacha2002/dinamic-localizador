import type { GoogleAddressComponent } from "../../../utils/store-location";

export const waitForContainerRefs = async (
  getMapContainer: () => HTMLDivElement | null,
  getAutocompleteContainer: () => HTMLDivElement | null,
  attempts = 40,
): Promise<{ mapContainer: HTMLDivElement; autocompleteContainer: HTMLDivElement } | null> => {
  for (let index = 0; index < attempts; index += 1) {
    const mapContainer = getMapContainer();
    const autocompleteContainer = getAutocompleteContainer();
    if (mapContainer && autocompleteContainer) {
      return { mapContainer, autocompleteContainer };
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  return null;
};

export const readLatLng = (position: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined) => {
  if (!position) {
    return null;
  }

  if (typeof (position as google.maps.LatLng).lat === "function") {
    const latLng = position as google.maps.LatLng;
    return { latitude: latLng.lat(), longitude: latLng.lng() };
  }

  const literal = position as google.maps.LatLngLiteral;
  return { latitude: literal.lat, longitude: literal.lng };
};

export const readDisplayName = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "text" in value) {
    const text = (value as { text?: string }).text;
    return text?.trim() ? text : null;
  }

  return null;
};

export const readAddressComponents = (place: google.maps.places.Place): GoogleAddressComponent[] => {
  const raw = (place as { addressComponents?: unknown[] }).addressComponents;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((component) => {
    const typed = component as { types?: string[]; longText?: string; shortText?: string };
    return {
      types: typed.types ?? [],
      longText: typed.longText,
      shortText: typed.shortText,
    };
  });
};

export const resolveManualState = (
  current: import("../../../utils/store-location").LocationPickerState,
): import("../../../utils/store-location").LocationPickerState => {
  if (current === "SELECTED" || current === "MANUAL") {
    return current;
  }

  return "EMPTY";
};
