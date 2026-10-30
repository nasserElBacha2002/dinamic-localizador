import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoverageTargetFromDeepLink,
  newCoverageCommandId,
  parseOperationCoverageSearchParams,
  stripOperationCoverageDeepLinkParams,
} from "./operation-coverage-deeplink";
import { operationalWorkdaySituationLabels } from "./operational-workday-presentation";

describe("operation-coverage-deeplink", () => {
  it("returns null when cover flag missing", () => {
    assert.equal(parseOperationCoverageSearchParams(new URLSearchParams()), null);
  });

  it("returns null when required params are incomplete", () => {
    const params = new URLSearchParams({
      cover: "1",
      employeeWorkdayId: "wd-1",
      assignmentId: "as-1",
    });
    assert.equal(parseOperationCoverageSearchParams(params), null);
  });

  it("parses a complete deep link", () => {
    const params = new URLSearchParams({
      cover: "1",
      employeeWorkdayId: "11111111-1111-1111-1111-111111111111",
      assignmentId: "22222222-2222-2222-2222-222222222222",
      absentEmployeeId: "33333333-3333-3333-3333-333333333333",
      absenceRequestId: "44444444-4444-4444-4444-444444444444",
      workDate: "2026-10-30",
      absentEmployeeName: "Ana",
      shiftLabel: "Mañana",
    });
    const parsed = parseOperationCoverageSearchParams(params);
    assert.ok(parsed);
    assert.equal(parsed?.workDate, "2026-10-30");
    assert.equal(parsed?.shiftLabel, "Mañana");
    const target = buildCoverageTargetFromDeepLink(parsed!);
    assert.equal(target.employeeWorkdayId, parsed?.employeeWorkdayId);
    assert.equal(target.workDateLabel, "2026-10-30");
    assert.equal(target.pendingCoverageLabel, operationalWorkdaySituationLabels.vacancyPending);
  });

  it("strips coverage deep link params from the URL", () => {
    const params = new URLSearchParams({
      cover: "1",
      employeeWorkdayId: "wd-1",
      assignmentId: "as-1",
      absentEmployeeId: "emp-1",
      absenceRequestId: "req-1",
      workDate: "2026-10-30",
      keep: "1",
    });
    const stripped = stripOperationCoverageDeepLinkParams(params);
    assert.equal(stripped.get("keep"), "1");
    assert.equal(parseOperationCoverageSearchParams(stripped), null);
  });

  it("generates stable-length command ids", () => {
    const id = newCoverageCommandId();
    assert.ok(id.length >= 8);
  });
});
