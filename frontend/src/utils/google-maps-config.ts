export function getGoogleMapsApiKey(): string {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

export function getGoogleMapsMapId(): string {
  const configured = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() ?? "";
  if (configured) {
    return configured;
  }

  if (import.meta.env.DEV) {
    return "DEMO_MAP_ID";
  }

  return "";
}
