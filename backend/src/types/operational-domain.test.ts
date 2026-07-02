import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AttendanceRecord,
  Employee,
  Inventory,
  InventoryEmployeeAssignment,
  Store,
} from "./domain";
import type {
  OperationAssignment,
  OperationAttendanceRecord,
  OperationalLocation,
  ScheduledOperation,
  Worker,
} from "./operational-domain";

type AssertAssignable<T extends U, U> = true;

type _OperationalLocationIsStore = AssertAssignable<OperationalLocation, Store>;
type _StoreIsOperationalLocation = AssertAssignable<Store, OperationalLocation>;
type _ScheduledOperationIsInventory = AssertAssignable<ScheduledOperation, Inventory>;
type _InventoryIsScheduledOperation = AssertAssignable<Inventory, ScheduledOperation>;
type _WorkerIsEmployee = AssertAssignable<Worker, Employee>;
type _EmployeeIsWorker = AssertAssignable<Employee, Worker>;
type _OperationAssignmentIsInventoryEmployeeAssignment = AssertAssignable<
  OperationAssignment,
  InventoryEmployeeAssignment
>;
type _OperationAttendanceRecordIsAttendanceRecord = AssertAssignable<
  OperationAttendanceRecord,
  AttendanceRecord
>;

const sampleStore: Store = {
  id: "store-1",
  name: "Centro",
  address: "Calle 1",
  neighborhood: null,
  locality: null,
  storeFormat: null,
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleInventory: Inventory = {
  id: "inventory-1",
  storeId: sampleStore.id,
  scheduledStart: "2026-01-01T20:30:00.000Z",
  scheduledEnd: "2026-01-02T03:00:00.000Z",
  earlyToleranceMinutes: 60,
  lateToleranceMinutes: 90,
  status: "SCHEDULED",
  notes: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleEmployee: Employee = {
  id: "employee-1",
  name: "Ana",
  documentNumber: null,
  phoneNumber: "+5491112345678",
  employeeType: "fijo",
  active: true,
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleAssignment: InventoryEmployeeAssignment = {
  inventoryId: sampleInventory.id,
  employeeId: sampleEmployee.id,
  assignedAt: "2026-01-01T00:00:00.000Z",
};

const sampleAttendance: AttendanceRecord = {
  id: "attendance-1",
  inventoryId: sampleInventory.id,
  employeeId: sampleEmployee.id,
  receivedLatitude: -34.6,
  receivedLongitude: -58.38,
  distanceMeters: 12,
  validationStatus: "VALID",
  locationStatus: "INSIDE_GEOFENCE",
  punctualityStatus: "ON_TIME",
  sourceMessageSid: null,
  validationReason: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  receivedAt: "2026-01-01T21:00:00.000Z",
  checkoutAt: null,
  checkoutLatitude: null,
  checkoutLongitude: null,
  checkoutDistanceMeters: null,
  checkoutStatus: null,
  checkoutReviewReason: null,
  earlyDepartureMinutes: null,
  extraWorkedMinutes: null,
  checkoutMessageSid: null,
  isSimulation: false,
  simulationSessionId: null,
  createdAt: "2026-01-01T21:00:00.000Z",
};

describe("operational domain aliases", () => {
  it("assigns Store-shaped objects to OperationalLocation", () => {
    const location: OperationalLocation = sampleStore;
    assert.equal(location.id, "store-1");
    assert.equal(location.allowedRadiusMeters, 150);
  });

  it("assigns Inventory-shaped objects to ScheduledOperation", () => {
    const operation: ScheduledOperation = sampleInventory;
    assert.equal(operation.storeId, sampleStore.id);
    assert.equal(operation.status, "SCHEDULED");
  });

  it("assigns Employee-shaped objects to Worker", () => {
    const worker: Worker = sampleEmployee;
    assert.equal(worker.phoneNumber, "+5491112345678");
    assert.equal(worker.employeeType, "fijo");
  });

  it("assigns InventoryEmployeeAssignment to OperationAssignment", () => {
    const assignment: OperationAssignment = sampleAssignment;
    assert.equal(assignment.inventoryId, sampleInventory.id);
    assert.equal(assignment.employeeId, sampleEmployee.id);
  });

  it("assigns AttendanceRecord to OperationAttendanceRecord", () => {
    const record: OperationAttendanceRecord = sampleAttendance;
    assert.equal(record.inventoryId, sampleInventory.id);
    assert.equal(record.employeeId, sampleEmployee.id);
  });
});
