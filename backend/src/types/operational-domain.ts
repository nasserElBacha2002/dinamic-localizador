import type {
  AttendanceRecord,
  Employee,
  Operation,
  OperationEmployeeAssignment,
  OperationWithService,
  Service,
} from "./domain";

/**
 * Conceptual alias for {@link Service}.
 *
 * Physical table: `operational_locations`. Product term: "Servicio".
 */
export type OperationalLocation = Service;

/**
 * Conceptual alias for {@link Operation}.
 *
 * Physical table: `scheduled_operations`. Product term: "Operación" / "Jornada".
 */
export type ScheduledOperation = Operation;

/**
 * Conceptual alias for {@link Employee}.
 *
 * Product-facing terminology: "Colaborador".
 */
export type Worker = Employee;

/**
 * Conceptual alias for {@link OperationEmployeeAssignment}.
 *
 * Physical table: `operation_assignments`.
 */
export type OperationAssignment = OperationEmployeeAssignment;

/**
 * Conceptual alias for {@link AttendanceRecord}.
 */
export type OperationAttendanceRecord = AttendanceRecord;
