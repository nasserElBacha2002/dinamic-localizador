export type TerminologyForm = "singular" | "plural";

export interface TerminologyEntry {
  singular: string;
  plural: string;
  legacySingular?: string;
  legacyPlural?: string;
  technical?: string;
}

export const terminology = {
  service: {
    singular: "Servicio",
    plural: "Servicios",
    legacySingular: "Tienda",
    legacyPlural: "Tiendas",
    technical: "service",
  },
  operation: {
    singular: "Operación",
    plural: "Operaciones",
    legacySingular: "Inventario",
    legacyPlural: "Inventarios",
    technical: "operation",
  },
  worker: {
    singular: "Colaborador",
    plural: "Colaboradores",
    legacySingular: "Empleado",
    legacyPlural: "Empleados",
    technical: "employee",
  },
  attendance: {
    singular: "Asistencia",
    plural: "Asistencias",
  },
  absence: {
    singular: "Ausencia",
    plural: "Ausencias",
  },
} as const satisfies Record<string, TerminologyEntry>;

export type TerminologyKey = keyof typeof terminology;

export const legacyTerminology = {
  service: {
    singular: terminology.service.legacySingular!,
    plural: terminology.service.legacyPlural!,
  },
  operation: {
    singular: terminology.operation.legacySingular!,
    plural: terminology.operation.legacyPlural!,
  },
  worker: {
    singular: terminology.worker.legacySingular!,
    plural: terminology.worker.legacyPlural!,
  },
} as const;

export function getTerminologyLabel(key: TerminologyKey, form: TerminologyForm = "singular"): string {
  return terminology[key][form];
}

export function formatTerminology(
  key: TerminologyKey,
  template: string,
  form: TerminologyForm = "singular",
): string {
  return template.replace(/\{term\}/g, getTerminologyLabel(key, form));
}

/** Assigned workers label used in tables and KPIs. */
export const assignedWorkersLabel = "Colaboradores asignados";

/** Service address label for forms and detail views. */
export const serviceAddressLabel = "Dirección del servicio";

/** Operation schedule label for detail views. */
export const operationScheduleLabel = "Horario de la operación";
