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
 * Current technical name remains `Store` / `stores` for DB and API compatibility.
 * Product-facing terminology may call this "Ubicación".
 */
export type OperationalLocation = Store;

/**
 * Conceptual alias for {@link Inventory}.
 *
 * Current technical name remains `Inventory` / `inventories` for DB and API compatibility.
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
 * Current technical name remains `inventory_employees` in the database.
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
