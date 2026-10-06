export const PRODUCT_EXPERIENCE_PHASES = [
  {
    id: "plan",
    title: "PLANIFICÁ",
    lines: ["EL EQUIPO CORRECTO.", "EN EL SERVICIO CORRECTO."],
  },
  {
    id: "detect",
    title: "DETECTÁ",
    lines: ["SI ALGO CAMBIA,", "LO SABÉS."],
  },
  {
    id: "resolve",
    title: "RESOLVÉ",
    lines: ["SABÉS QUÉ", "PODÉS HACER."],
  },
  {
    id: "automate",
    title: "AUTOMATIZÁ",
    lines: ["AUTOMATIZÁ", "LO REPETITIVO."],
  },
  {
    id: "control",
    title: "CONTROL",
    lines: ["TODA TU OPERACIÓN.", "UNA SOLA VISTA."],
  },
] as const;

export type ProductExperiencePhaseIndex = 0 | 1 | 2 | 3 | 4;

export const PRODUCT_SERVICES = [
  { name: "Oficina Central", client: "Cliente A" },
  { name: "Planta Norte", client: "Cliente B" },
  { name: "Hospital", client: "Cliente C" },
  { name: "Depósito", client: "Cliente D" },
] as const;

export const PLAN_TEAM = ["María", "Lucas", "Carla", "Juan", "Diego"] as const;

export const RESOLVE_ALTERNATIVES = [
  { name: "María Gómez", detail: "Disponible · 8 min" },
  { name: "Carlos López", detail: "Experiencia previa" },
  { name: "Sofía Pérez", detail: "Disponible" },
] as const;

export const AUTOMATE_STEPS = [
  "Alerta enviada",
  "Coordinación notificada",
  "Alternativa consultada",
  "Servicio actualizado",
] as const;
