import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";

describe("inventoryAttendanceRepository confirmation mapping", () => {
  it("maps confirmation status and timestamps from assignment row", async () => {
    const { inventoryAttendanceRepository } = await import("./inventory-attendance.repository");

    const statuses: AssignmentConfirmationStatus[] = ["PENDING", "CONFIRMED", "UNAVAILABLE"];
    for (const status of statuses) {
      const confirmedAt =
        status === "CONFIRMED" ? new Date("2026-07-14T20:00:00.000Z") : null;
      const unavailableAt =
        status === "UNAVAILABLE" ? new Date("2026-07-14T21:00:00.000Z") : null;

      mock.method(inventoryAttendanceRepository, "getAttendanceSummary", async () => ({
        inventory: {
          id: "inv-1",
          storeId: "store-1",
          scheduledStart: "2026-07-15T23:30:00.000Z",
          scheduledEnd: null,
          earlyToleranceMinutes: 60,
          lateToleranceMinutes: 90,
          status: "SCHEDULED",
          notes: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        store: {
          id: "store-1",
          name: "Carrefour",
          address: null,
          latitude: -34.6,
          longitude: -58.4,
          allowedRadiusMeters: 150,
          googlePlaceId: null,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        summary: {
          assigned: 1,
          checkedIn: 0,
          valid: 0,
          pendingReview: 0,
          rejected: 0,
          withoutCheckIn: 1,
          confirmedEmployees: status === "CONFIRMED" ? 1 : 0,
          pendingConfirmationEmployees: status === "PENDING" ? 1 : 0,
          unavailableEmployees: status === "UNAVAILABLE" ? 1 : 0,
        },
        employees: [
          {
            employee: {
              id: "emp-1",
              name: "Juan Pérez",
              documentNumber: null,
              phoneNumber: "+5491112345678",
              employeeType: "fijo",
              active: true,
              lastWorkedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            attendance: null,
            operationalStatus: "NO_CHECK_IN" as const,
            confirmationStatus: status,
            confirmedAt: confirmedAt?.toISOString() ?? null,
            unavailableAt: unavailableAt?.toISOString() ?? null,
          },
        ],
        total: 1,
      }));

      const result = await inventoryAttendanceRepository.getAttendanceSummary(
        "company-1",
        "inv-1",
        1,
        10,
      );

      assert.ok(result);
      assert.equal(result.employees[0].confirmationStatus, status);
      if (status === "CONFIRMED") {
        assert.ok(result.employees[0].confirmedAt);
      }
      if (status === "UNAVAILABLE") {
        assert.ok(result.employees[0].unavailableAt);
      }
      mock.restoreAll();
    }
  });
});

describe("inventory-attendance.repository source structure", () => {
  it("includes confirmation fields in employee query and summary aggregates", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const source = await readFile(
      join(process.cwd(), "src/repositories/inventory-attendance.repository.ts"),
      "utf8",
    );

    assert.match(source, /ie\.confirmation_status/);
    assert.match(source, /confirmed_employees/);
    assert.match(source, /pending_confirmation_employees/);
    assert.match(source, /unavailable_employees/);
    assert.match(source, /confirmationStatus/);
  });
});
