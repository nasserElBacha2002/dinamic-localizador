import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AttendanceRecord,
  Employee,
  Operation,
  OperationEmployeeAssignment,
  Service,
} from "./domain";
import type {
  OperationAssignment,
  OperationAttendanceRecord,
  OperationalLocation,
  ScheduledOperation,
  Worker,
} from "./operational-domain";

type AssertAssignable<T extends U, U> = true;

type _OperationalLocationIsService = AssertAssignable<OperationalLocation, Service>;
type _ServiceIsOperationalLocation = AssertAssignable<Service, OperationalLocation>;
type _ScheduledOperationIsOperation = AssertAssignable<ScheduledOperation, Operation>;
type _OperationIsScheduledOperation = AssertAssignable<Operation, ScheduledOperation>;
type _WorkerIsEmployee = AssertAssignable<Worker, Employee>;
type _EmployeeIsWorker = AssertAssignable<Employee, Worker>;
type _OperationAssignmentIsOperationEmployeeAssignment = AssertAssignable<
  OperationAssignment,
  OperationEmployeeAssignment
>;
type _OperationAttendanceRecordIsAttendanceRecord = AssertAssignable<
  OperationAttendanceRecord,
  AttendanceRecord
>;

const sampleService: Service = {
  id: "service-1",
  name: "Centro",
  address: "Calle 1",
  neighborhood: null,
  locality: null,
  serviceFormat: null,
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleOperation: Operation = {
  id: "operation-1",
  serviceId: sampleService.id,
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

const sampleAssignment: OperationEmployeeAssignment = {
  operationId: sampleOperation.id,
  employeeId: sampleEmployee.id,
  assignedAt: "2026-01-01T00:00:00.000Z",
};

const sampleAttendance: AttendanceRecord = {
  id: "attendance-1",
  operationId: sampleOperation.id,
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
  it("assigns Service-shaped objects to OperationalLocation", () => {
    const location: OperationalLocation = sampleService;
    assert.equal(location.id, "service-1");
    assert.equal(location.allowedRadiusMeters, 150);
  });

  it("assigns Operation-shaped objects to ScheduledOperation", () => {
    const operation: ScheduledOperation = sampleOperation;
    assert.equal(operation.serviceId, sampleService.id);
    assert.equal(operation.status, "SCHEDULED");
  });

  it("assigns Employee-shaped objects to Worker", () => {
    const worker: Worker = sampleEmployee;
    assert.equal(worker.phoneNumber, "+5491112345678");
    assert.equal(worker.employeeType, "fijo");
  });

  it("assigns OperationEmployeeAssignment to OperationAssignment", () => {
    const assignment: OperationAssignment = sampleAssignment;
    assert.equal(assignment.operationId, sampleOperation.id);
    assert.equal(assignment.employeeId, sampleEmployee.id);
  });

  it("assigns AttendanceRecord to OperationAttendanceRecord", () => {
    const record: OperationAttendanceRecord = sampleAttendance;
    assert.equal(record.operationId, sampleOperation.id);
    assert.equal(record.employeeId, sampleEmployee.id);
  });
});
