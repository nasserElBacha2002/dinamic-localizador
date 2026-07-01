export type TerminologyForm = "singular" | "plural";

export interface TerminologyEntry {
  singular: string;
  plural: string;
  legacySingular?: string;
  legacyPlural?: string;
  technical?: string;
}

export const terminology = {
  location: {
    singular: "Ubicación",
    plural: "Ubicaciones",
    legacySingular: "Tienda",
    legacyPlural: "Tiendas",
    technical: "store",
  },
  operation: {
    singular: "Operación",
    plural: "Operaciones",
    legacySingular: "Inventario",
    legacyPlural: "Inventarios",
    technical: "inventory",
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
  location: {
    singular: terminology.location.legacySingular!,
    plural: terminology.location.legacyPlural!,
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

/** Location address label for forms and detail views. */
export const locationAddressLabel = "Dirección de la ubicación";

/** Operation schedule label for detail views. */
export const operationScheduleLabel = "Horario de la operación";
