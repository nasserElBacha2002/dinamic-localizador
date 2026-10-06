export type ChaosIconKind = "chat" | "phone" | "sheet" | "clock" | "alert" | "map" | "user" | "pending";

export type ChaosNodeDef = {
  id: string;
  label: string;
  icon: ChaosIconKind;
  x: number;
  y: number;
  rotate: number;
  floatDelay: number;
  mobileOrder: number;
  scale?: "sm" | "md" | "lg";
  urgent?: boolean;
  relatedIds?: readonly string[];
};

export const CHAOS_RELATED: Record<string, readonly string[]> = {
  whatsapp: ["pending", "arrived"],
  absence: ["cover", "replace"],
  sheet: ["note", "incomplete"],
  call: ["client", "arrived"],
  pending: ["whatsapp", "arrived"],
};

export const CHAOS_ROADMAP_PATH_DESKTOP =
  "M 48 72 C 120 24, 180 140, 248 88 S 380 160, 452 72 S 560 200, 648 128 S 720 240, 752 312";

export const CHAOS_ROADMAP_PATH_MOBILE = "M 50 8 C 72 18, 28 28, 50 38 S 68 52, 32 62 S 58 78, 50 92";

export const CHAOS_FLOATING_ALERTS = [
  { id: "flash-absence", label: "Ausencia detectada", x: 6, y: 4, urgent: true },
  { id: "flash-msg", label: "+3 mensajes", x: 78, y: 6, urgent: false },
  { id: "flash-call", label: "Llamada perdida", x: 70, y: 78, urgent: true },
] as const;

export const CHAOS_NODES: ChaosNodeDef[] = [
  { id: "whatsapp", label: "WhatsApp", icon: "chat", x: 8, y: 14, rotate: -6, floatDelay: 0, mobileOrder: 0, scale: "lg", relatedIds: CHAOS_RELATED.whatsapp },
  { id: "sheet", label: "Planilla", icon: "sheet", x: 72, y: 10, rotate: 4, floatDelay: 0.4, mobileOrder: 1, scale: "md", relatedIds: CHAOS_RELATED.sheet },
  { id: "call", label: "Llamada", icon: "phone", x: 22, y: 38, rotate: -3, floatDelay: 0.8, mobileOrder: 2, relatedIds: CHAOS_RELATED.call },
  { id: "cover", label: "¿Quién cubre?", x: 58, y: 32, rotate: 2, floatDelay: 0.2, mobileOrder: 3, icon: "user", scale: "lg", urgent: true },
  { id: "pending", label: "Confirmación pendiente", icon: "pending", x: 84, y: 42, rotate: -5, floatDelay: 1.1, mobileOrder: 4, urgent: true, relatedIds: CHAOS_RELATED.pending },
  { id: "schedule", label: "Cambio de horario", icon: "clock", x: 12, y: 58, rotate: 3, floatDelay: 0.6, mobileOrder: 5 },
  { id: "absence", label: "Ausencia", icon: "alert", x: 38, y: 52, rotate: -4, floatDelay: 1.4, mobileOrder: 6, urgent: true, scale: "lg", relatedIds: CHAOS_RELATED.absence },
  { id: "client", label: "Cliente llamó", icon: "phone", x: 66, y: 58, rotate: 5, floatDelay: 0.9, mobileOrder: 7, urgent: true },
  { id: "arrived", label: "¿Llegó?", icon: "pending", x: 46, y: 22, rotate: -2, floatDelay: 1.6, mobileOrder: 8 },
  { id: "replace", label: "Reemplazo", icon: "user", x: 78, y: 68, rotate: -3, floatDelay: 0.3, mobileOrder: 9 },
  { id: "location", label: "Ubicación", icon: "map", x: 18, y: 78, rotate: 4, floatDelay: 1.2, mobileOrder: 10 },
  { id: "note", label: "Nota manual", icon: "sheet", x: 52, y: 72, rotate: -1, floatDelay: 0.7, mobileOrder: 11, scale: "sm" },
  { id: "incomplete", label: "Servicio incompleto", icon: "alert", x: 32, y: 68, rotate: 2, floatDelay: 1, mobileOrder: 12, urgent: true },
];

export const CHAOS_CONTROL_STATS = [
  { tone: "ok" as const, label: "12 cubiertos" },
  { tone: "warn" as const, label: "2 atención" },
  { tone: "pending" as const, label: "3 pendientes" },
];

export function chaosNodeIsLinked(nodeId: string, highlightId: string | null): boolean {
  if (!highlightId) {
    return false;
  }
  if (nodeId === highlightId) {
    return true;
  }
  const related = CHAOS_RELATED[highlightId];
  return related?.includes(nodeId) ?? false;
}
