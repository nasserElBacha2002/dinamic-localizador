/** Datos ilustrativos para la landing (no métricas reales de clientes). */

export const OPS_PRIMARY_METRICS = [
  { id: "services-today", value: 12, label: "Servicios hoy", format: "integer" as const },
  { id: "coverage", value: 92, label: "Cobertura", format: "percent" as const },
  { id: "attendance", value: 96, label: "Presentismo", format: "percent" as const },
  { id: "late-arrivals", value: 2, label: "Llegadas tarde", format: "integer" as const },
] as const;

export const OPS_PROGRESS_BARS = [
  { id: "services-covered", label: "Servicios cubiertos", display: "10/12", ratio: 10 / 12, tone: "ok" as const },
  { id: "attendance-bar", label: "Presentismo", display: "96%", ratio: 0.96, tone: "info" as const },
  { id: "coverage-bar", label: "Cobertura general", display: "92%", ratio: 0.92, tone: "brand" as const },
] as const;

export const OPS_SECONDARY_STATS = [
  { id: "extra-hours", value: "+6 h", label: "Horas adicionales trabajadas" },
  { id: "absence-reported", value: "1", label: "Ausencia informada" },
  { id: "pending-confirmations", value: "0", label: "Confirmaciones pendientes" },
] as const;

export const OPS_DAY_REPORT_ITEMS = [
  {
    id: "covered",
    tone: "ok" as const,
    title: "10 servicios cubiertos",
    detail: "La mayoría de la operación avanza según lo planificado.",
  },
  {
    id: "attention",
    tone: "warn" as const,
    title: "1 servicio requiere atención",
    detail: "Oficina Central necesita cobertura.",
  },
  {
    id: "starting",
    tone: "info" as const,
    title: "1 servicio por comenzar",
    detail: "Inicio programado dentro de los próximos 30 minutos.",
  },
  {
    id: "late",
    tone: "info" as const,
    title: "2 llegadas tarde",
    detail: "Ambos servicios quedaron igualmente cubiertos.",
  },
] as const;
