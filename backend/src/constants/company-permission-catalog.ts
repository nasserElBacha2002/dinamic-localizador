import type { CompanyPermission, CompanyRole } from "../types/company";
import { COMPANY_ROLES } from "../types/company";
import { resolvePermissionsForRole, roleHasPermission } from "./company-permissions";
import {
  listAssignableCompanyRoles,
  listInvitableCompanyRoles,
} from "./company-role-hierarchy";

export type PermissionModuleKey =
  | "company"
  | "users"
  | "employees"
  | "services"
  | "operations"
  | "attendance"
  | "absences"
  | "payroll_receipts"
  | "reports"
  | "bot_simulator";

export type RoleRestrictionCode =
  | "MODULE_MUST_BE_ENABLED"
  | "CANNOT_EDIT_SELF"
  | "CANNOT_DEACTIVATE_SELF"
  | "CANNOT_MANAGE_USERS"
  | "ONLY_LOWER_RANK_ON_EDIT"
  | "OWNER_CAN_INVITE_PEER_OWNERS"
  | "MEMBERSHIP_STATUS_GATES_ACTIONS";

export interface PermissionCatalogMetadata {
  module: PermissionModuleKey;
  moduleLabel: string;
  label: string;
  description: string;
}

export interface RoleCapabilityPermissionDto {
  code: CompanyPermission;
  module: string;
  label: string;
  description: string;
  documented: true;
}

export interface RoleRestrictionDto {
  code: RoleRestrictionCode;
  message: string;
}

export interface RoleCapabilitiesDto {
  role: CompanyRole;
  name: string;
  description: string;
  isSystemRole: true;
  permissions: RoleCapabilityPermissionDto[];
  restrictions: RoleRestrictionDto[];
}

const MODULE_LABELS: Record<PermissionModuleKey, string> = {
  company: "Empresa",
  users: "Usuarios",
  employees: "Colaboradores",
  services: "Servicios",
  operations: "Operaciones",
  attendance: "Asistencias",
  absences: "Ausencias",
  payroll_receipts: "Recibos de sueldo",
  reports: "Reportes",
  bot_simulator: "Simulador de bot",
};

const ROLE_NAMES: Record<CompanyRole, string> = {
  OWNER: "Dueño",
  ADMIN: "Administrador",
  HR: "RRHH",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operador",
  READ_ONLY: "Solo lectura",
};

const ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
  OWNER:
    "Control total de la empresa, incluyendo la gestión de usuarios y la configuración avanzada.",
  ADMIN:
    "Administra la operación diaria y la configuración. No gestiona usuarios de la empresa.",
  HR: "Gestiona colaboradores, ausencias y recibos de sueldo, con lectura de asistencias y reportes.",
  SUPERVISOR:
    "Consulta la operación y revisa asistencias. Puede usar el simulador de bot cuando el módulo está habilitado.",
  OPERATOR: "Consulta operaciones y asistencias. Acceso operativo limitado a lectura.",
  READ_ONLY: "Consulta información operativa en modo solo lectura.",
};

const RESTRICTION_MESSAGES: Record<RoleRestrictionCode, string> = {
  MODULE_MUST_BE_ENABLED:
    "Los módulos deben estar habilitados para la empresa; un permiso no otorga acceso a un módulo desactivado.",
  CANNOT_EDIT_SELF:
    "Nadie puede editar su propio usuario desde esta pantalla (incluye superadministradores).",
  CANNOT_DEACTIVATE_SELF: "Nadie puede desactivarse a sí mismo desde esta pantalla.",
  CANNOT_MANAGE_USERS:
    "No puede gestionar usuarios de la empresa (invitar, editar o desactivar).",
  ONLY_LOWER_RANK_ON_EDIT:
    "Al editar usuarios existentes solo puede asignar roles de rango inferior al suyo.",
  OWNER_CAN_INVITE_PEER_OWNERS:
    "Puede invitar otros Dueños; al editar usuarios existentes solo puede asignar roles de rango inferior.",
  MEMBERSHIP_STATUS_GATES_ACTIONS:
    "Las acciones concretas también dependen del estado del usuario (activo/inactivo) y de reglas de negocio por pantalla.",
};

/** Exhaustive catalog: every `CompanyPermission` must have metadata. */
export const PERMISSION_CATALOG = {
  "company:read": {
    module: "company",
    moduleLabel: MODULE_LABELS.company,
    label: "Ver datos de la empresa",
    description: "Permite consultar la información y configuración visible de la empresa.",
  },
  "company:settings:update": {
    module: "company",
    moduleLabel: MODULE_LABELS.company,
    label: "Modificar configuración",
    description: "Permite actualizar ajustes de la empresa (horarios, ausencias, etc.).",
  },
  "users:manage": {
    module: "users",
    moduleLabel: MODULE_LABELS.users,
    label: "Gestionar usuarios",
    description: "Permite invitar, editar y desactivar usuarios de la empresa.",
  },
  "employees:read": {
    module: "employees",
    moduleLabel: MODULE_LABELS.employees,
    label: "Ver colaboradores",
    description: "Permite consultar el listado y detalle de colaboradores.",
  },
  "employees:manage": {
    module: "employees",
    moduleLabel: MODULE_LABELS.employees,
    label: "Administrar colaboradores",
    description: "Permite crear y modificar colaboradores y grupos de trabajo.",
  },
  "services:read": {
    module: "services",
    moduleLabel: MODULE_LABELS.services,
    label: "Ver servicios",
    description: "Permite consultar servicios y su información de ubicación.",
  },
  "services:manage": {
    module: "services",
    moduleLabel: MODULE_LABELS.services,
    label: "Administrar servicios",
    description: "Permite crear y modificar servicios.",
  },
  "operations:read": {
    module: "operations",
    moduleLabel: MODULE_LABELS.operations,
    label: "Ver operaciones",
    description: "Permite consultar operaciones y asignaciones.",
  },
  "operations:manage": {
    module: "operations",
    moduleLabel: MODULE_LABELS.operations,
    label: "Administrar operaciones",
    description: "Permite crear, editar y gestionar operaciones y equipos.",
  },
  "attendance:read": {
    module: "attendance",
    moduleLabel: MODULE_LABELS.attendance,
    label: "Ver asistencias",
    description: "Permite consultar registros de asistencia.",
  },
  "attendance:review": {
    module: "attendance",
    moduleLabel: MODULE_LABELS.attendance,
    label: "Revisar asistencias",
    description: "Permite aprobar o rechazar asistencias pendientes de revisión.",
  },
  "attendance:export": {
    module: "attendance",
    moduleLabel: MODULE_LABELS.attendance,
    label: "Exportar asistencias",
    description: "Permite exportar información de asistencias.",
  },
  "absences:read": {
    module: "absences",
    moduleLabel: MODULE_LABELS.absences,
    label: "Ver ausencias",
    description: "Permite consultar solicitudes y tipos de ausencia.",
  },
  "absences:review": {
    module: "absences",
    moduleLabel: MODULE_LABELS.absences,
    label: "Revisar ausencias",
    description: "Permite aprobar, rechazar o solicitar información sobre ausencias.",
  },
  "absences:balance:update": {
    module: "absences",
    moduleLabel: MODULE_LABELS.absences,
    label: "Ajustar saldos de ausencias",
    description: "Permite modificar saldos de días de ausencia de colaboradores.",
  },
  "payroll_receipts:read": {
    module: "payroll_receipts",
    moduleLabel: MODULE_LABELS.payroll_receipts,
    label: "Ver recibos de sueldo",
    description: "Permite consultar recibos de sueldo cargados.",
  },
  "payroll_receipts:upload": {
    module: "payroll_receipts",
    moduleLabel: MODULE_LABELS.payroll_receipts,
    label: "Cargar recibos",
    description: "Permite subir recibos de sueldo.",
  },
  "payroll_receipts:manage": {
    module: "payroll_receipts",
    moduleLabel: MODULE_LABELS.payroll_receipts,
    label: "Administrar recibos",
    description: "Permite gestionar lotes y estados de recibos de sueldo.",
  },
  "payroll_receipts:delete": {
    module: "payroll_receipts",
    moduleLabel: MODULE_LABELS.payroll_receipts,
    label: "Eliminar recibos",
    description: "Permite eliminar recibos de sueldo.",
  },
  "payroll_receipts:download": {
    module: "payroll_receipts",
    moduleLabel: MODULE_LABELS.payroll_receipts,
    label: "Descargar recibos",
    description: "Permite descargar archivos de recibos de sueldo.",
  },
  "reports:read": {
    module: "reports",
    moduleLabel: MODULE_LABELS.reports,
    label: "Ver reportes",
    description: "Permite consultar estadísticas y reportes.",
  },
  "reports:export": {
    module: "reports",
    moduleLabel: MODULE_LABELS.reports,
    label: "Exportar reportes",
    description: "Permite exportar información de reportes y estadísticas.",
  },
  "bot_simulator:use": {
    module: "bot_simulator",
    moduleLabel: MODULE_LABELS.bot_simulator,
    label: "Usar simulador de bot",
    description: "Permite probar flujos conversacionales del bot.",
  },
} as const satisfies Record<CompanyPermission, PermissionCatalogMetadata>;

const buildPermissionDto = (code: CompanyPermission): RoleCapabilityPermissionDto => {
  const entry = PERMISSION_CATALOG[code];
  return {
    code,
    module: entry.moduleLabel,
    label: entry.label,
    description: entry.description,
    documented: true,
  };
};

/**
 * Builds restriction notices from the same domain helpers used by invitation/update guards.
 * Informational only — does not replace server-side authorization.
 */
export const buildRoleRestrictions = (role: CompanyRole): RoleRestrictionDto[] => {
  const restrictions: RoleRestrictionDto[] = [
    {
      code: "MODULE_MUST_BE_ENABLED",
      message: RESTRICTION_MESSAGES.MODULE_MUST_BE_ENABLED,
    },
    {
      code: "CANNOT_EDIT_SELF",
      message: RESTRICTION_MESSAGES.CANNOT_EDIT_SELF,
    },
    {
      code: "CANNOT_DEACTIVATE_SELF",
      message: RESTRICTION_MESSAGES.CANNOT_DEACTIVATE_SELF,
    },
  ];

  if (!roleHasPermission(role, "users:manage")) {
    restrictions.push({
      code: "CANNOT_MANAGE_USERS",
      message: RESTRICTION_MESSAGES.CANNOT_MANAGE_USERS,
    });
  } else if (role === "OWNER") {
    restrictions.push({
      code: "OWNER_CAN_INVITE_PEER_OWNERS",
      message: RESTRICTION_MESSAGES.OWNER_CAN_INVITE_PEER_OWNERS,
    });
    restrictions.push({
      code: "ONLY_LOWER_RANK_ON_EDIT",
      message: RESTRICTION_MESSAGES.ONLY_LOWER_RANK_ON_EDIT,
    });
  } else {
    // users:manage without OWNER is not currently assigned by ROLE_PERMISSIONS,
    // but if it were, edit policy still requires strictly lower ranks.
    restrictions.push({
      code: "ONLY_LOWER_RANK_ON_EDIT",
      message: RESTRICTION_MESSAGES.ONLY_LOWER_RANK_ON_EDIT,
    });
  }

  restrictions.push({
    code: "MEMBERSHIP_STATUS_GATES_ACTIONS",
    message: RESTRICTION_MESSAGES.MEMBERSHIP_STATUS_GATES_ACTIONS,
  });

  return restrictions;
};

export const isCompanyRole = (value: string): value is CompanyRole =>
  (COMPANY_ROLES as readonly string[]).includes(value);

export const buildRoleCapabilities = (role: CompanyRole): RoleCapabilitiesDto => {
  const permissions = [...resolvePermissionsForRole(role)]
    .map(buildPermissionDto)
    .sort((left, right) => {
      const moduleCmp = left.module.localeCompare(right.module, "es");
      if (moduleCmp !== 0) {
        return moduleCmp;
      }
      return left.label.localeCompare(right.label, "es");
    });

  return {
    role,
    name: ROLE_NAMES[role],
    description: ROLE_DESCRIPTIONS[role],
    isSystemRole: true,
    permissions,
    restrictions: buildRoleRestrictions(role),
  };
};

/** Test/helper: assignable + invitable lists derived from hierarchy helpers for the consulted role. */
export const getRoleHierarchySummary = (role: CompanyRole) => ({
  assignableRoles: listAssignableCompanyRoles(role, false),
  invitableRoles: listInvitableCompanyRoles(role, false),
  canManageUsers: roleHasPermission(role, "users:manage"),
});
