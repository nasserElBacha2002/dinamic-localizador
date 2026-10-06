export const LANDING_SEO = {
  title: "Dinamic Operations | Planificá y mantené cubiertos tus servicios",
  description:
    "Organizá equipos, detectá problemas y resolvé cambios e imprevistos en servicios con personal distribuido. Conocé Dinamic Operations.",
  /** Intención SEO del brief; no duplicar como H1 visible. */
  seoHeadline:
    "Mantené cada servicio cubierto, incluso cuando la operación cambia.",
} as const;

export const EMPLOYEE_COUNT_RANGES = [
  { value: "1-25", label: "1 – 25" },
  { value: "26-100", label: "26 – 100" },
  { value: "101-500", label: "101 – 500" },
  { value: "501+", label: "Más de 500" },
] as const;

export const SITUATIONS = [
  {
    id: "missing-person",
    title: "Faltó una persona",
    line: "Detectás el hueco y ves alternativas sin rearmar todo en un chat.",
  },
  {
    id: "tomorrow-team",
    title: "Armá el equipo de mañana",
    line: "Planificás servicios, personas y horarios en un solo lugar.",
  },
  {
    id: "services-started",
    title: "¿Arrancaron todos los servicios?",
    line: "Una vista del estado real de la operación, servicio por servicio.",
  },
  {
    id: "move-person",
    title: "Mover a alguien sin otro problema",
    line: "Evaluás el impacto antes de confirmar un cambio.",
  },
] as const;

export const SITUATIONS_SUPPORTING_TEXT =
  "Lo que pasa en la operación, lo ves y lo resolvés sin desarmar todo por chat.";

export const AUDIENCE_ITEMS = [
  "Empresas de limpieza",
  "Facility services",
  "Servicios tercerizados",
  "Múltiples clientes y ubicaciones",
] as const;
