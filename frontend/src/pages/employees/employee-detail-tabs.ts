export type EmployeeDetailTabKey =
  | "resumen"
  | "operaciones"
  | "asistencias"
  | "ausencias"
  | "recibos"
  | "estadisticas";

export const EMPLOYEE_DETAIL_TABS: Array<{ value: EmployeeDetailTabKey; label: string }> = [
  { value: "resumen", label: "Resumen" },
  { value: "operaciones", label: "Operaciones" },
  { value: "asistencias", label: "Asistencias" },
  { value: "ausencias", label: "Ausencias" },
  { value: "recibos", label: "Recibos" },
  { value: "estadisticas", label: "Estadísticas" },
];

export const parseEmployeeDetailTab = (value: string | null): EmployeeDetailTabKey => {
  const match = EMPLOYEE_DETAIL_TABS.find((tab) => tab.value === value);
  return match?.value ?? "resumen";
};
