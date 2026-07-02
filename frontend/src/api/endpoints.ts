/** Preferred frontend API paths (Phase 2.8). Browser routes remain /stores and /inventories. */
export const API_ENDPOINTS = {
  locations: "locations",
  operations: "operations",
  employees: "employees",
  lookups: {
    locations: "lookups/locations",
    operations: "lookups/operations",
    employees: "lookups/employees",
  },
} as const;

/** Canonical backend paths kept for nested routes without operation aliases. */
export const LEGACY_API_ENDPOINTS = {
  stores: "stores",
  inventories: "inventories",
} as const;

/**
 * Assignment routes are mounted only under `/inventories/:inventoryId/employees`
 * (not `/operations/:inventoryId/employees`). Keep until backend adds alias mount.
 */
export const inventoryAssignmentPath = (inventoryId: string): string =>
  `${LEGACY_API_ENDPOINTS.inventories}/${inventoryId}/employees`;

export const inventoryAssignmentMemberPath = (
  inventoryId: string,
  employeeId: string,
): string => `${inventoryAssignmentPath(inventoryId)}/${employeeId}`;

export const operationPath = (operationId: string): string =>
  `${API_ENDPOINTS.operations}/${operationId}`;

export const locationPath = (locationId: string): string =>
  `${API_ENDPOINTS.locations}/${locationId}`;
