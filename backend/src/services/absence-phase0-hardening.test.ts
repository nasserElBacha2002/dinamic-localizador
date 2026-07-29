import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ABSENCE_OVERLAP_STATUS_SQL } from "../constants/absence-transitions";

describe("absence Phase 0 hardening contracts", () => {
  it("overlap SQL includes NEEDS_INFO and excludes REJECTED/CANCELLED", () => {
    assert.match(ABSENCE_OVERLAP_STATUS_SQL, /NEEDS_INFO/);
    assert.match(ABSENCE_OVERLAP_STATUS_SQL, /PENDING/);
    assert.match(ABSENCE_OVERLAP_STATUS_SQL, /APPROVED/);
    assert.doesNotMatch(ABSENCE_OVERLAP_STATUS_SQL, /REJECTED/);
    assert.doesNotMatch(ABSENCE_OVERLAP_STATUS_SQL, /CANCELLED/);
  });

  it("create path auto-approves when requiresApproval is false", () => {
    const source = readFileSync(
      join(__dirname, "absence-request.service.ts"),
      "utf8",
    );
    assert.match(source, /if\s*\(\s*!absenceType\.requiresApproval\s*\)/);
    assert.match(source, /AUTO_APPROVE/);
    assert.match(source, /Aprobación automática/);
  });

  it("exposes updateNeedsInfo and resubmit on the request service", () => {
    const source = readFileSync(
      join(__dirname, "absence-request.service.ts"),
      "utf8",
    );
    assert.match(source, /async updateNeedsInfo\(/);
    assert.match(source, /async resubmit\(/);
    assert.match(source, /eventType:\s*"RESUBMITTED"/);
    assert.match(source, /eventType:\s*"UPDATED"/);
  });

  it("review transitions use conditional onlyIfStatusIn updates", () => {
    const source = readFileSync(join(__dirname, "absence-review.service.ts"), "utf8");
    assert.match(source, /onlyIfStatusIn:\s*\[\.\.\.ABSENCE_REVIEWABLE_STATUSES\]/);
    assert.match(source, /ABSENCE_ALREADY_REVIEWED/);
  });

  it("routes gate edit/resubmit/review behind absences:review", () => {
    const source = readFileSync(
      join(__dirname, "../routes/absence-request.routes.ts"),
      "utf8",
    );
    assert.match(source, /patch\(\s*"\/:id"/);
    assert.match(source, /"\/:id\/resubmit"/);
    const reviewGuards = source.match(/requirePermission\("absences:review"\)/g) ?? [];
    assert.ok(reviewGuards.length >= 6);
  });
});
