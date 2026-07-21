import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentPeriodsOverlap } from "../utils/assignment-period";
import { classifyPreviewEmployees } from "./work-team-assignment.service";
import type { WorkTeamMember } from "../types/work-team";
import type { OperationEmployeeAssignment } from "../types/domain";

const employee = {
  id: "emp-1",
  name: "Juan Pérez",
  documentNumber: null,
  phoneNumber: "+5491100000000",
  employeeType: "fijo" as const,
  categoryId: null,
  category: null,
  active: true,
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const cancelledAssignment = (
  overrides: Partial<OperationEmployeeAssignment> = {},
): OperationEmployeeAssignment => ({
  id: "assignment-cancelled",
  companyId: "company-1",
  operationId: "operation-1",
  employeeId: "emp-1",
  validFrom: "2026-07-13",
  validUntil: "2026-07-13",
  confirmationStatus: "PENDING",
  confirmedAt: null,
  unavailableAt: null,
  cancelledAt: "2026-07-13T12:00:00.000Z",
  assignmentOrigin: "WORK_TEAM",
  sourceWorkTeamId: "team-1",
  sourceAssignmentBatchId: null,
  sourceWorkTeamName: "Grupo de prueba",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("reassignment after cancellation", () => {
  it("does not treat cancelled assignments as overlap", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: cancelledAssignment(),
        requested: { validFrom: "2026-07-13", validUntil: "2026-07-13" },
      }),
      "no_overlap",
    );
  });

  it("allows preview assign after cancelled assignment for same group member", () => {
    const membersByTeam = new Map<string, WorkTeamMember[]>([
      [
        "team-1",
        [
          {
            id: "member-1",
            workTeamId: "team-1",
            employeeId: "emp-1",
            employee,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ],
    ]);

    const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["team-1"],
      [cancelledAssignment()],
      "2026-07-13",
      "2026-07-13",
    );

    assert.equal(assignableEmployees.length, 1);
    assert.equal(skippedEmployees.length, 0);
    assert.equal(assignableEmployees[0]?.employeeId, "emp-1");
  });

  it("still blocks active overlapping assignments", () => {
    const activeAssignment = cancelledAssignment({
      id: "assignment-active",
      cancelledAt: null,
    });

    const membersByTeam = new Map<string, WorkTeamMember[]>([
      [
        "team-1",
        [
          {
            id: "member-1",
            workTeamId: "team-1",
            employeeId: "emp-1",
            employee,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ],
    ]);

    const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["team-1"],
      [activeAssignment],
      "2026-07-13",
      "2026-07-13",
    );

    assert.equal(assignableEmployees.length, 0);
    assert.equal(skippedEmployees.length, 1);
    assert.equal(skippedEmployees[0]?.reason, "already_assigned");
  });
});
