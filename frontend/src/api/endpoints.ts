export const API_ENDPOINTS = {
  services: "services",
  operations: "operations",
  employees: "employees",
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

export const servicePath = (serviceId: string): string =>
  `${API_ENDPOINTS.services}/${serviceId}`;
