export const HERO_SERVICES = [
  "Cliente Norte",
  "Planta 2",
  "Oficina Central",
  "Depósito",
  "Sucursal A",
  "Sucursal B",
  "Hospital",
  "Shopping",
  "Fábrica",
  "Torre 1",
  "Torre 2",
  "Campus",
] as const;

export type HeroPhase = "stable" | "incident" | "alternatives" | "resolve" | "resolved";

export const HERO_SEQUENCE: HeroPhase[] = ["stable", "incident", "alternatives", "resolve", "resolved"];
