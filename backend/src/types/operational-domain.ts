import type {
  AttendanceRecord,
  Employee,
  Inventory,
  InventoryEmployeeAssignment,
  Store,
} from "./domain";

/**
 * Conceptual alias for {@link Store}.
 *
 * Physical table (Phase 2.7): `operational_locations`. Legacy view: `stores`.
 * API routes and JSON fields (`storeId`, `storeName`) remain unchanged.
 * Product-facing terminology may call this "Ubicación".
 */
export type OperationalLocation = Store;

/**
 * Conceptual alias for {@link Inventory}.
 *
 * Physical table (Phase 2.7): `scheduled_operations`. Legacy view: `inventories`.
 * API routes and JSON fields (`inventoryId`, …) remain unchanged.
 * Product-facing terminology may call this "Operación" (scheduled operation).
 */
export type ScheduledOperation = Inventory;

/**
 * Conceptual alias for {@link Employee}.
 *
 * Current technical name remains `Employee` / `employees` for DB and API compatibility.
 * Product-facing terminology may call this "Colaborador".
 */
export type Worker = Employee;

/**
 * Conceptual alias for {@link InventoryEmployeeAssignment}.
 *
 * Physical table (Phase 2.7): `operation_assignments`. Legacy view: `inventory_employees`.
 * Product-facing terminology may call this an operation assignment.
 */
export type OperationAssignment = InventoryEmployeeAssignment;

/**
 * Conceptual alias for {@link AttendanceRecord}.
 *
 * Current technical name remains `AttendanceRecord` / `attendance_records`.
 * Represents check-in/check-out evidence for a scheduled operation.
 */
export type OperationAttendanceRecord = AttendanceRecord;
