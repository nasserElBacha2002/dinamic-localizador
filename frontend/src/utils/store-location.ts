export type LocationPickerState = "EMPTY" | "SEARCHING" | "SELECTED" | "MANUAL" | "ERROR";

export type GoogleMapsErrorCode =
  | "API_KEY_MISSING"
  | "MAP_ID_MISSING"
  | "PLACES_NOT_AUTHORIZED"
  | "MAPS_NOT_AUTHORIZED"
  | "REFERRER_NOT_ALLOWED"
  | "PLACE_WITHOUT_GEOMETRY"
  | "LOAD_FAILED"
  | "UNKNOWN";

export interface PlaceSelectionResult {
  googlePlaceId: string;
  address: string;
  displayName: string | null;
  latitude: number;
  longitude: number;
}

export interface StoreLocationFields {
  address?: string;
  latitude: number;
  longitude: number;
  googlePlaceId?: string | null;
  allowedRadiusMeters: number;
  name?: string;
}

export const isValidLatitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -180 && value <= 180;

export const isValidCoordinatePair = (latitude: number, longitude: number): boolean =>
  isValidLatitude(latitude) && isValidLongitude(longitude);

export const hasConfirmedLocation = (
  state: LocationPickerState,
  latitude: number,
  longitude: number,
): boolean =>
  (state === "SELECTED" || state === "MANUAL") && isValidCoordinatePair(latitude, longitude);

export const resolveInitialLocationState = (input: {
  isEditMode: boolean;
  latitude: number;
  longitude: number;
  googlePlaceId?: string | null;
}): LocationPickerState => {
  if (!input.isEditMode || !isValidCoordinatePair(input.latitude, input.longitude)) {
    return "EMPTY";
  }

  return input.googlePlaceId?.trim() ? "SELECTED" : "MANUAL";
};

export const applyPlaceSelection = (
  current: StoreLocationFields,
  place: PlaceSelectionResult,
  currentName?: string,
): { fields: StoreLocationFields; state: LocationPickerState } => {
  const fields: StoreLocationFields = {
    ...current,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    googlePlaceId: place.googlePlaceId,
  };

  if (!currentName?.trim() && place.displayName) {
    fields.name = place.displayName;
  }

  return { fields, state: "SELECTED" };
};

export const applyManualCoordinates = (
  current: StoreLocationFields,
  latitude: number,
  longitude: number,
): { fields: StoreLocationFields; state: LocationPickerState } | null => {
  if (!isValidCoordinatePair(latitude, longitude)) {
    return null;
  }

  return {
    fields: {
      ...current,
      latitude,
      longitude,
      googlePlaceId: null,
    },
    state: "MANUAL",
  };
};

export const applyMarkerDrag = (
  current: StoreLocationFields,
  latitude: number,
  longitude: number,
): { fields: StoreLocationFields; state: LocationPickerState } | null =>
  applyManualCoordinates(current, latitude, longitude);

export const mapGoogleMapsError = (error: unknown): { code: GoogleMapsErrorCode; message: string } => {
  const raw = error instanceof Error ? error.message : String(error);

  if (raw.includes("GOOGLE_MAPS_CONTAINER_MISSING")) {
    return {
      code: "LOAD_FAILED",
      message: "No se pudo inicializar el mapa. Podés ingresar las coordenadas manualmente.",
    };
  }

  if (raw.includes("GOOGLE_MAPS_API_KEY_MISSING") || raw.includes("API_KEY_MISSING")) {
    return {
      code: "API_KEY_MISSING",
      message: "No se configuró la API key de Google Maps. Podés ingresar las coordenadas manualmente.",
    };
  }

  if (raw.includes("MAP_ID_MISSING")) {
    return {
      code: "MAP_ID_MISSING",
      message: "Falta configurar VITE_GOOGLE_MAPS_MAP_ID para usar el mapa interactivo.",
    };
  }

  const lower = raw.toLowerCase();

  if (lower.includes("referer") || lower.includes("referrernotallowedmaperror")) {
    return {
      code: "REFERRER_NOT_ALLOWED",
      message: "La API key no permite este dominio. Revisá las restricciones de referrer en Google Cloud.",
    };
  }

  if (lower.includes("places") && (lower.includes("not authorized") || lower.includes("api key"))) {
    return {
      code: "PLACES_NOT_AUTHORIZED",
      message: "Places API no está habilitada o autorizada para esta clave.",
    };
  }

  if (lower.includes("maps") && (lower.includes("not authorized") || lower.includes("api key"))) {
    return {
      code: "MAPS_NOT_AUTHORIZED",
      message: "Maps JavaScript API no está habilitada o autorizada para esta clave.",
    };
  }

  if (raw.includes("PLACE_WITHOUT_GEOMETRY")) {
    return {
      code: "PLACE_WITHOUT_GEOMETRY",
      message: "No se encontraron coordenadas para la dirección seleccionada.",
    };
  }

  if (raw.includes("GOOGLE_MAPS_LOAD_FAILED") || lower.includes("could not load")) {
    return {
      code: "LOAD_FAILED",
      message: "No se pudo cargar Google Maps. Podés ingresar las coordenadas manualmente.",
    };
  }

  return {
    code: "UNKNOWN",
    message: "No se pudo cargar Google Maps. Podés ingresar las coordenadas manualmente.",
  };
};

export const locationStateLabel: Record<LocationPickerState, string> = {
  EMPTY: "Sin ubicación confirmada",
  SEARCHING: "Buscando dirección…",
  SELECTED: "Ubicación confirmada",
  MANUAL: "Ubicación confirmada (manual)",
  ERROR: "Error al cargar el mapa",
};
