import type { ImportEntityType } from "../types/import";
import type { CompanyPermission } from "../types/permissions";
import { terminology } from "../domain/terminology";

export interface ImportEntityUiStrategy {
  entityType: ImportEntityType;
  label: string;
  title: string;
  description: string;
  help: string;
  permission: CompanyPermission;
  successMessage: string;
  templateFileName: string;
}

export const IMPORT_ENTITY_STRATEGIES: ImportEntityUiStrategy[] = [
  {
    entityType: "operations",
    label: terminology.operation.plural,
    title: `Importar ${terminology.operation.plural.toLowerCase()}`,
    description: "Cargá un CSV o XLSX, revisá la vista previa y confirmá la importación.",
    help: [
      "Formatos: CSV y XLSX.",
      "Formato mínimo: Sucursal, Fecha.",
      "También se acepta el formato extendido legacy con fecha_inicio y fecha_fin.",
      "Los horarios y tolerancias faltantes usan la configuración de operaciones de la empresa.",
      "Solo se crean operaciones nuevas; los duplicados se rechazan.",
    ].join(" "),
    permission: "operations:manage",
    successMessage: `${terminology.operation.plural} importadas correctamente.`,
    templateFileName: "plantilla-importacion-operaciones.csv",
  },
  {
    entityType: "services",
    label: terminology.service.plural,
    title: `Importar ${terminology.service.plural.toLowerCase()}`,
    description: "Importá servicios con nombre, coordenadas y datos opcionales de ubicación.",
    help: [
      "Columnas: Nombre, Latitud, Longitud (obligatorias).",
      "Opcionales: Dirección, Barrio, Localidad, Formato, Radio (metros), Google Place ID.",
      "El Formato debe coincidir con un tipo de ubicación activo (nombre o código).",
      "Si el nombre ya existe en la compañía, la fila se rechaza.",
    ].join(" "),
    permission: "services:manage",
    successMessage: `${terminology.service.plural} importados correctamente.`,
    templateFileName: "plantilla-importacion-servicios.csv",
  },
  {
    entityType: "employees",
    label: terminology.worker.plural,
    title: `Importar ${terminology.worker.plural.toLowerCase()}`,
    description: "Importá colaboradores con teléfono E.164, tipo y categoría opcional.",
    help: [
      "Columnas: Nombre, Teléfono, Tipo (obligatorias).",
      "Opcionales: Documento, Categoría (por nombre, sin crear categorías nuevas).",
      "Tipo: Fijo o Eventual. Teléfono en E.164 (ej. +5491112345678).",
      "Si el teléfono ya existe en la compañía, la fila se rechaza.",
      "Modo importación: no envía WhatsApp, invitaciones ni crea credenciales.",
    ].join(" "),
    permission: "employees:manage",
    successMessage: `${terminology.worker.plural} importados correctamente.`,
    templateFileName: "plantilla-importacion-colaboradores.csv",
  },
];

export const getImportEntityStrategy = (
  entityType: ImportEntityType,
): ImportEntityUiStrategy => {
  const strategy = IMPORT_ENTITY_STRATEGIES.find((item) => item.entityType === entityType);
  if (!strategy) {
    return IMPORT_ENTITY_STRATEGIES[0]!;
  }
  return strategy;
};

export const isImportEntityType = (value: string | null | undefined): value is ImportEntityType =>
  value === "operations" || value === "services" || value === "employees";
