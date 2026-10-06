export const HERO_SCENE_PHASES = ["normal", "error", "resolve", "covered"] as const;

export type HeroScenePhase = (typeof HERO_SCENE_PHASES)[number];

/** Índice del servicio afectado (Sucursal A en narrativa). */
export const HERO_SCENE_ALERT_INDEX = 4;

export const HERO_SCENE_PHASE_MS = 2500;

export const HERO_SCENE_COPY = {
  normal: "Operación normal",
  errorTitle: "Ausencia detectada",
  errorDetail: "Sucursal A · 08:00 → 16:00",
  resolveSearch: "Buscando alternativa…",
  resolveFound: "María Gómez disponible",
  covered: "Servicio cubierto",
  reducedFound: "Dinamic encontró una alternativa",
} as const;

export function heroSceneReducedPhase(): HeroScenePhase {
  return "covered";
}

export function heroSceneAlertIndex(serviceCount: number): number {
  if (serviceCount <= 6) {
    return 2;
  }
  return HERO_SCENE_ALERT_INDEX;
}
