/** Physical SQL Server table names after Phase 2.7 rename. */
export const OPERATIONAL_LOCATIONS_TABLE = "operational_locations";
export const SCHEDULED_OPERATIONS_TABLE = "scheduled_operations";
export const OPERATION_ASSIGNMENTS_TABLE = "operation_assignments";

/** Legacy compatibility views (SQL Server simple views; DML not blocked — app writes use physical tables). */
export const LEGACY_STORES_VIEW = "stores";
export const LEGACY_INVENTORIES_VIEW = "inventories";
export const LEGACY_INVENTORY_EMPLOYEES_VIEW = "inventory_employees";
