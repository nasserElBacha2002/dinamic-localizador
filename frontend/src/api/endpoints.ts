export const API_ENDPOINTS = {
  services: "services",
  serviceFacets: "services/facets",
  operations: "operations",
  employees: "employees",
  shiftTemplates: "shift-templates",
  lookups: {
    services: "lookups/services",
    operations: "lookups/operations",
    employees: "lookups/employees",
  },
} as const;

export const operationAssignmentPath = (operationId: string): string =>
  `${API_ENDPOINTS.operations}/${operationId}/employees`;

export const operationAssignmentMemberPath = (
  operationId: string,
  assignmentId: string,
): string => `${operationAssignmentPath(operationId)}/${assignmentId}`;

export const operationAssignmentCancelPath = (
  operationId: string,
  assignmentId: string,
): string => `${operationAssignmentMemberPath(operationId, assignmentId)}/cancel`;

export const operationAssignmentEndPath = (
  operationId: string,
  assignmentId: string,
): string => `${operationAssignmentMemberPath(operationId, assignmentId)}/end`;

export const operationPath = (operationId: string): string =>
  `${API_ENDPOINTS.operations}/${operationId}`;

export const operationWorkdaysPath = (operationId: string): string =>
  `${operationPath(operationId)}/workdays`;

export const operationReactivatePath = (operationId: string): string =>
  `${operationPath(operationId)}/reactivate`;

export const servicePath = (serviceId: string): string =>
  `${API_ENDPOINTS.services}/${serviceId}`;

export const shiftTemplatesPath = (): string => API_ENDPOINTS.shiftTemplates;

export const shiftTemplatePath = (templateId: string): string =>
  `${API_ENDPOINTS.shiftTemplates}/${templateId}`;

export const operationShiftsPath = (operationId: string): string =>
  `${operationPath(operationId)}/shifts`;

export const operationShiftPath = (operationId: string, shiftId: string): string =>
  `${operationShiftsPath(operationId)}/${shiftId}`;

export const operationShiftVersionsPath = (operationId: string, shiftId: string): string =>
  `${operationShiftPath(operationId, shiftId)}/versions`;

export const operationShiftExceptionsPath = (operationId: string, shiftId: string): string =>
  `${operationShiftPath(operationId, shiftId)}/exceptions`;

export const operationScheduleModeMultiPath = (operationId: string): string =>
  `${operationPath(operationId)}/schedule-mode/multi-shift`;

export const operationScheduleModeSinglePath = (operationId: string): string =>
  `${operationPath(operationId)}/schedule-mode/single`;
