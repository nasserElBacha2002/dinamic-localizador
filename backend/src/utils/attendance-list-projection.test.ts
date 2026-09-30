import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAttendanceListRowKey,
  mapAttendanceListRow,
  normalizeAttendanceListIdFilters,
} from "./attendance-list-projection";
import { EFFECTIVE_STATE_SQL } from "./employee-workday-statistics-projection";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

describe("normalizeAttendanceListIdFilters", () => {
  it("uses singular only", () => {
    assert.deepEqual(
      normalizeAttendanceListIdFilters({
        operationId: ID_A,
        employeeId: ID_B,
        serviceId: ID_C,
      }),
      { operationIds: [ID_A], employeeIds: [ID_B], serviceIds: [ID_C] },
    );
  });

  it("uses plural only", () => {
    assert.deepEqual(
      normalizeAttendanceListIdFilters({
        operationIds: [ID_A, ID_B],
        employeeIds: [ID_C],
        serviceIds: [ID_A],
      }),
      { operationIds: [ID_A, ID_B], employeeIds: [ID_C], serviceIds: [ID_A] },
    );
  });

  it("merges singular after plural without duplicates", () => {
    assert.deepEqual(
      normalizeAttendanceListIdFilters({
        operationId: ID_A,
        operationIds: [ID_B, ID_A],
        employeeId: ID_C,
        employeeIds: [ID_B],
        serviceId: ID_A,
        serviceIds: [ID_C],
      }),
      {
        operationIds: [ID_B, ID_A],
        employeeIds: [ID_B, ID_C],
        serviceIds: [ID_C, ID_A],
      },
    );
  });

  it("combines operation, employee and service filters independently", () => {
    const normalized = normalizeAttendanceListIdFilters({
      operationId: ID_A,
      employeeIds: [ID_B, ID_C],
      serviceId: ID_B,
    });
    assert.deepEqual(normalized.operationIds, [ID_A]);
    assert.deepEqual(normalized.employeeIds, [ID_B, ID_C]);
    assert.deepEqual(normalized.serviceIds, [ID_B]);
  });
});

describe("buildAttendanceListRowKey", () => {
  it("keeps expected workday and simulation identities distinct for same workday", () => {
    const workdayId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const simId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const expectedKey = buildAttendanceListRowKey({
      listRowKind: "expected_workday",
      employeeWorkdayId: workdayId,
      attendanceId: null,
    });
    const simulationKey = buildAttendanceListRowKey({
      listRowKind: "simulation",
      employeeWorkdayId: workdayId,
      attendanceId: simId,
    });
    assert.equal(expectedKey, `ew:${workdayId}`);
    assert.equal(simulationKey, `sim:${simId}`);
    assert.notEqual(expectedKey, simulationKey);
  });
});

describe("mapAttendanceListRow", () => {
  const baseRow = {
    employee_workday_id: "11111111-1111-1111-1111-111111111111",
    employee_id: "22222222-2222-2222-2222-222222222222",
    operation_id: "33333333-3333-3333-3333-333333333333",
    employee_name: "María",
    employee_phone_number: "+5491100000000",
    operation_status: "IN_PROGRESS",
    operation_scheduled_start: new Date("2026-09-30T11:00:00.000Z"),
    operation_scheduled_end: new Date("2026-09-30T19:00:00.000Z"),
    service_id: "44444444-4444-4444-4444-444444444444",
    service_name: "Servicio A",
    service_address: "Calle 1",
    service_allowed_radius_meters: 100,
    work_date: "2026-09-30",
    expected_start_at: new Date("2026-09-30T11:00:00.000Z"),
    expected_end_at: new Date("2026-09-30T19:00:00.000Z"),
    shift_name_snapshot: "Mañana",
  };

  it("maps assigned employee with on-time arrival", () => {
    const row = mapAttendanceListRow({
      ...baseRow,
      employee_name: "Juan",
      attendance_id: "55555555-5555-5555-5555-555555555555",
      validation_status: "VALID",
      location_status: "INSIDE_GEOFENCE",
      punctuality_status: "ON_TIME",
      received_at: new Date("2026-09-30T10:55:00.000Z"),
      created_at: new Date("2026-09-30T10:55:00.000Z"),
      is_simulation: false,
      effective_state: "PRESENT",
    });

    assert.equal(row.hasAttendanceRecord, true);
    assert.equal(row.effectiveState, "PRESENT");
    assert.equal(row.punctualityStatus, "ON_TIME");
    assert.equal(row.validationStatus, "VALID");
    assert.equal(row.listRowKind, "expected_workday");
    assert.equal(row.listRowKey, `ew:${baseRow.employee_workday_id}`);
  });

  it("maps assigned employee with late arrival", () => {
    const row = mapAttendanceListRow({
      ...baseRow,
      employee_name: "Pedro",
      attendance_id: "66666666-6666-6666-6666-666666666666",
      validation_status: "VALID",
      location_status: "INSIDE_GEOFENCE",
      punctuality_status: "LATE",
      received_at: new Date("2026-09-30T11:20:00.000Z"),
      created_at: new Date("2026-09-30T11:20:00.000Z"),
      is_simulation: false,
      effective_state: "PRESENT",
    });

    assert.equal(row.hasAttendanceRecord, true);
    assert.equal(row.punctualityStatus, "LATE");
  });

  it("maps assigned employee with early arrival", () => {
    const row = mapAttendanceListRow({
      ...baseRow,
      attendance_id: "77777777-7777-7777-7777-777777777777",
      validation_status: "VALID",
      location_status: "INSIDE_GEOFENCE",
      punctuality_status: "EARLY",
      received_at: new Date("2026-09-30T10:50:00.000Z"),
      created_at: new Date("2026-09-30T10:50:00.000Z"),
      is_simulation: false,
      effective_state: "PRESENT",
    });

    assert.equal(row.punctualityStatus, "EARLY");
  });

  it("maps no-punch rows without inventing validation PENDING_REVIEW", () => {
    const expected = mapAttendanceListRow({
      ...baseRow,
      attendance_id: null,
      effective_state: "EXPECTED",
    });
    const absent = mapAttendanceListRow({
      ...baseRow,
      attendance_id: null,
      effective_state: "ABSENT",
    });

    assert.equal(expected.hasAttendanceRecord, false);
    assert.equal(expected.validationStatus, null);
    assert.equal(expected.effectiveState, "EXPECTED");
    assert.equal(expected.receivedAt, null);
    assert.equal(expected.listRowKey, `ew:${baseRow.employee_workday_id}`);

    assert.equal(absent.hasAttendanceRecord, false);
    assert.equal(absent.validationStatus, null);
    assert.equal(absent.effectiveState, "ABSENT");
  });

  it("maps arrival without checkout", () => {
    const row = mapAttendanceListRow({
      ...baseRow,
      attendance_id: "88888888-8888-8888-8888-888888888888",
      validation_status: "VALID",
      location_status: "INSIDE_GEOFENCE",
      punctuality_status: "ON_TIME",
      received_at: new Date("2026-09-30T11:00:00.000Z"),
      checkout_at: null,
      created_at: new Date("2026-09-30T11:00:00.000Z"),
      is_simulation: false,
      effective_state: "PRESENT",
    });

    assert.equal(row.hasAttendanceRecord, true);
    assert.ok(row.receivedAt);
    assert.equal(row.checkoutAt, null);
  });

  it("keeps distinct rows for multiple expected shifts same employee/day via workday id", () => {
    const morning = mapAttendanceListRow({
      ...baseRow,
      employee_workday_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      shift_name_snapshot: "Mañana",
      attendance_id: null,
      effective_state: "ABSENT",
    });
    const afternoon = mapAttendanceListRow({
      ...baseRow,
      employee_workday_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      shift_name_snapshot: "Tarde",
      expected_start_at: new Date("2026-09-30T19:00:00.000Z"),
      expected_end_at: new Date("2026-09-30T23:00:00.000Z"),
      attendance_id: null,
      effective_state: "EXPECTED",
    });

    assert.notEqual(morning.listRowKey, afternoon.listRowKey);
    assert.equal(morning.employeeId, afternoon.employeeId);
    assert.equal(morning.workDate, afternoon.workDate);
  });

  it("maps simulation row with distinct listRowKey", () => {
    const row = mapAttendanceListRow(
      {
        ...baseRow,
        list_row_kind: "simulation",
        attendance_id: "99999999-9999-9999-9999-999999999999",
        validation_status: "VALID",
        location_status: "INSIDE_GEOFENCE",
        punctuality_status: "ON_TIME",
        received_at: new Date("2026-09-30T11:00:00.000Z"),
        created_at: new Date("2026-09-30T11:00:00.000Z"),
        is_simulation: true,
        effective_state: "PRESENT",
      },
      "simulation",
    );
    assert.equal(row.listRowKind, "simulation");
    assert.equal(row.listRowKey, "sim:99999999-9999-9999-9999-999999999999");
  });
});

describe("attendance list effective state SQL", () => {
  it("reuses statistics EFFECTIVE_STATE_SQL for EXPECTED vs ABSENT", () => {
    assert.match(EFFECTIVE_STATE_SQL, /THEN N'EXPECTED'/);
    assert.match(EFFECTIVE_STATE_SQL, /ELSE N'ABSENT'/);
    assert.match(EFFECTIVE_STATE_SQL, /late_tolerance_minutes/);
  });
});
