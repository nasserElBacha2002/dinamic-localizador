import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";

describe("employee deactivation impact contract", () => {
  it("exposes the fields required by the confirmation modal", () => {
    const impact: EmployeeDeactivationImpact = {
      collaboratorId: "11111111-1111-1111-1111-111111111111",
      canDeactivateDirectly: false,
      affectedAssignmentsCount: 1,
      affectedAssignments: [
        {
          assignmentId: "22222222-2222-2222-2222-222222222222",
          operationId: "33333333-3333-3333-3333-333333333333",
          operationName: "Sucursal Palermo",
          operationType: "RECURRING",
          workdayId: "44444444-4444-4444-4444-444444444444",
          date: "2026-07-25",
          startTime: "09:00",
          endTime: "14:00",
          status: "SCHEDULED",
          locationName: "Sucursal Palermo",
          workTeamName: "Equipo Norte",
        },
      ],
      activeWorkTeamMemberships: [
        {
          workTeamId: "55555555-5555-5555-5555-555555555555",
          workTeamName: "Equipo Norte",
        },
      ],
    };

    assert.equal(impact.canDeactivateDirectly, false);
    assert.equal(impact.affectedAssignmentsCount, 1);
    assert.equal(
      operationKindLabels[impact.affectedAssignments[0]!.operationType],
      "Trabajo habitual",
    );
    assert.ok(impact.affectedAssignments[0]!.workTeamName);
  });
});
