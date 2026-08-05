import {
  canAccessModuleRoute,
  type ModuleRouteAccessKey,
} from "./company-modules";
import {
  buildEmployeeAbsencesPath,
  buildEmployeeAttendancePath,
  buildEmployeePayrollReceiptsPath,
  buildEmployeeStatisticsPath,
} from "./employee-module-links";
import type { CompanyModule } from "../types/company-module";

export interface EmployeeModuleQuickLinkDef {
  accessKey: ModuleRouteAccessKey;
  label: string;
  to: string;
}

export function listEmployeeModuleQuickLinkCandidates(
  employeeId: string,
): EmployeeModuleQuickLinkDef[] {
  return [
    {
      accessKey: "attendance",
      label: "Ver asistencias",
      to: buildEmployeeAttendancePath(employeeId),
    },
    {
      accessKey: "absences",
      label: "Ver ausencias",
      to: buildEmployeeAbsencesPath(employeeId),
    },
    {
      accessKey: "payroll_receipts",
      label: "Ver recibos de sueldo",
      to: buildEmployeePayrollReceiptsPath(employeeId),
    },
    {
      accessKey: "reports",
      label: "Ver estadísticas",
      to: buildEmployeeStatisticsPath(employeeId),
    },
  ];
}

export function filterEmployeeModuleQuickLinks(
  employeeId: string,
  modules: CompanyModule[] | undefined,
  permissions: string[] | undefined,
): EmployeeModuleQuickLinkDef[] {
  return listEmployeeModuleQuickLinkCandidates(employeeId).filter((link) =>
    canAccessModuleRoute(modules, permissions, link.accessKey),
  );
}
