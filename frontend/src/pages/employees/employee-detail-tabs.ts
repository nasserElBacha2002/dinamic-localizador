import type { ModuleRouteAccessKey } from "../../utils/company-modules";

export type EmployeeDetailTabKey =
  | "resumen"
  | "operaciones"
  | "asistencias"
  | "ausencias"
  | "recibos"
  | "estadisticas";

export type EmployeeDetailTabConfig = {
  value: EmployeeDetailTabKey;
  label: string;
  moduleAccessKey?: ModuleRouteAccessKey;
};

export const EMPLOYEE_DETAIL_TABS: EmployeeDetailTabConfig[] = [
  { value: "resumen", label: "Resumen" },
  { value: "operaciones", label: "Operaciones", moduleAccessKey: "operations" },
  { value: "asistencias", label: "Asistencias", moduleAccessKey: "attendance" },
  { value: "ausencias", label: "Ausencias", moduleAccessKey: "absences" },
  { value: "recibos", label: "Recibos", moduleAccessKey: "payroll_receipts" },
  { value: "estadisticas", label: "Estadísticas", moduleAccessKey: "reports" },
];

export const parseEmployeeDetailTab = (value: string | null): EmployeeDetailTabKey => {
  const match = EMPLOYEE_DETAIL_TABS.find((tab) => tab.value === value);
  return match?.value ?? "resumen";
};
