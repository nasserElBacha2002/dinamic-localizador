import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Employee, OperationEmployeeAssignment } from "../types/domain";
import type { WorkTeamMember } from "../types/work-team";
import { assignmentPeriodsOverlap } from "../utils/assignment-period";
import { classifyPreviewEmployees } from "./work-team-assignment.service";

const employee = (id: string, active = true): Employee => ({
  id,
  name: `Employee ${id}`,
  documentNumber: null,
  phoneNumber: "+5491100000000",
  employeeType: "INTERNAL",
  active,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const assignment = (
  employeeId: string,
  validFrom: string,
  validUntil: string | null,
  cancelledAt: string | null = null,
): OperationEmployeeAssignment => ({
  id: `assignment-${employeeId}-${validFrom}`,
  companyId: "company-1",
  operationId: "operation-1",
  employeeId,
  validFrom,
  validUntil,
  assignedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  cancelledAt,
  sourceAssignmentBatchId: null,
  sourceWorkTeamId: null,
  assignmentOrigin: "MANUAL",
});

const buildMembersByTeam = (
  entries: Array<{ teamId: string; employeeId: string; active?: boolean }>,
): Map<string, WorkTeamMember[]> => {
  const byTeam = new Map<string, WorkTeamMember[]>();
  for (const entry of entries) {
    const list = byTeam.get(entry.teamId) ?? [];
    list.push({
      workTeamId: entry.teamId,
      employeeId: entry.employeeId,
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: null,
      employee: employee(entry.employeeId, entry.active ?? true),
    });
    byTeam.set(entry.teamId, list);
  }
  return byTeam;
};

describe("assignmentPeriodsOverlap", () => {
  it("detects exact same period as already_assigned", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-01", validUntil: "2026-07-31" },
        requested: { validFrom: "2026-07-01", validUntil: "2026-07-31" },
      }),
      "already_assigned",
    );
  });

  it("detects partial overlap at the start", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-01", validUntil: "2026-07-15" },
        requested: { validFrom: "2026-07-10", validUntil: "2026-07-31" },
      }),
      "assignment_period_overlap",
    );
  });

  it("detects partial overlap at the end", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-15", validUntil: "2026-07-31" },
        requested: { validFrom: "2026-07-01", validUntil: "2026-07-20" },
      }),
      "assignment_period_overlap",
    );
  });

  it("detects contained period", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-01", validUntil: "2026-07-31" },
        requested: { validFrom: "2026-07-10", validUntil: "2026-07-20" },
      }),
      "assignment_period_overlap",
    );
  });

  it("detects containing period", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-10", validUntil: "2026-07-20" },
        requested: { validFrom: "2026-07-01", validUntil: "2026-07-31" },
      }),
      "assignment_period_overlap",
    );
  });

  it("detects overlap between two open-ended periods", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-01", validUntil: null },
        requested: { validFrom: "2026-08-01", validUntil: null },
      }),
      "assignment_period_overlap",
    );
  });

  it("returns no_overlap for sequential non-overlapping periods", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-07-01", validUntil: "2026-07-10" },
        requested: { validFrom: "2026-08-01", validUntil: "2026-08-31" },
      }),
      "no_overlap",
    );
    assert.equal(
      assignmentPeriodsOverlap({
        existing: { validFrom: "2026-08-01", validUntil: "2026-08-31" },
        requested: { validFrom: "2026-07-01", validUntil: "2026-07-10" },
      }),
      "no_overlap",
    );
  });

  it("ignores cancelled assignments", () => {
    assert.equal(
      assignmentPeriodsOverlap({
        existing: {
          validFrom: "2026-07-01",
          validUntil: "2026-07-31",
          cancelledAt: "2026-07-05T00:00:00.000Z",
        },
        requested: { validFrom: "2026-07-01", validUntil: "2026-07-31" },
      }),
      "no_overlap",
    );
  });
});

describe("classifyPreviewEmployees", () => {
  const validFrom = "2026-08-01";
  const validUntil = "2026-08-31";

  it("assigns employee shared across two groups once", () => {
    const membersByTeam = buildMembersByTeam([
      { teamId: "group-a", employeeId: "juan" },
      { teamId: "group-a", employeeId: "pedro" },
      { teamId: "group-b", employeeId: "juan" },
      { teamId: "group-b", employeeId: "maria" },
    ]);

    const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["group-a", "group-b"],
      [],
      validFrom,
      validUntil,
    );

    assert.equal(assignableEmployees.length, 3);
    assert.equal(skippedEmployees.length, 0);

    const juan = assignableEmployees.find((entry) => entry.employeeId === "juan");
    assert.ok(juan);
    assert.deepEqual([...juan!.workTeamIds].sort(), ["group-a", "group-b"]);
    assert.equal(juan!.primaryWorkTeamId, "group-a");
  });

  it("assigns employee shared across three groups once", () => {
    const membersByTeam = buildMembersByTeam([
      { teamId: "a", employeeId: "emp-1" },
      { teamId: "b", employeeId: "emp-1" },
      { teamId: "c", employeeId: "emp-1" },
    ]);

    const { assignableEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["a", "b", "c"],
      [],
      validFrom,
      validUntil,
    );

    assert.equal(assignableEmployees.length, 1);
    assert.equal(assignableEmployees[0]!.workTeamIds.length, 3);
  });

  it("deduplicates repeated group ids in request", () => {
    const membersByTeam = buildMembersByTeam([
      { teamId: "group-a", employeeId: "pedro" },
    ]);

    const { assignableEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["group-a", "group-a"],
      [],
      validFrom,
      validUntil,
    );

    assert.equal(assignableEmployees.length, 1);
    assert.deepEqual(assignableEmployees[0]!.workTeamIds, ["group-a"]);
  });

  it("skips inactive employees", () => {
    const membersByTeam = buildMembersByTeam([
      { teamId: "group-a", employeeId: "inactive-1", active: false },
    ]);

    const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["group-a"],
      [],
      validFrom,
      validUntil,
    );

    assert.equal(assignableEmployees.length, 0);
    assert.equal(skippedEmployees.length, 1);
    assert.equal(skippedEmployees[0]!.reason, "employee_inactive");
  });

  it("does not treat non-overlapping historical assignment as conflict", () => {
    const membersByTeam = buildMembersByTeam([{ teamId: "group-a", employeeId: "juan" }]);
    const existing = [assignment("juan", "2026-07-01", "2026-07-10")];

    const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["group-a"],
      existing,
      validFrom,
      validUntil,
    );

    assert.equal(assignableEmployees.length, 1);
    assert.equal(skippedEmployees.length, 0);
  });

  it("classifies exact period as already_assigned", () => {
    const membersByTeam = buildMembersByTeam([{ teamId: "group-a", employeeId: "juan" }]);
    const existing = [assignment("juan", validFrom, validUntil)];

    const { skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["group-a"],
      existing,
      validFrom,
      validUntil,
    );

    assert.equal(skippedEmployees.length, 1);
    assert.equal(skippedEmployees[0]!.reason, "already_assigned");
  });

  it("classifies partial overlap as assignment_period_overlap", () => {
    const membersByTeam = buildMembersByTeam([{ teamId: "group-a", employeeId: "juan" }]);
    const existing = [assignment("juan", "2026-08-15", "2026-09-15")];

    const { skippedEmployees } = classifyPreviewEmployees(
      membersByTeam,
      ["group-a"],
      existing,
      validFrom,
      validUntil,
    );

    assert.equal(skippedEmployees.length, 1);
    assert.equal(skippedEmployees[0]!.reason, "assignment_period_overlap");
  });
});
