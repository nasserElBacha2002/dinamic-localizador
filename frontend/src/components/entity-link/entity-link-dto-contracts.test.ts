import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("DTO contracts include stable navigation ids", () => {
  it("AttendanceByOperationRow includes serviceId in backend and frontend types", () => {
    const be = readFileSync(
      resolve(process.cwd(), "../backend/src/types/statistics.ts"),
      "utf8",
    );
    const fe = readFileSync(
      resolve(process.cwd(), "src/types/statistics.ts"),
      "utf8",
    );
    assert.match(be, /interface AttendanceByOperationRow \{[\s\S]*serviceId:/);
    assert.match(fe, /interface AttendanceByOperationRow \{[\s\S]*serviceId/);
  });

  it("WorkTeamUsageRecord includes serviceId", () => {
    const be = readFileSync(resolve(process.cwd(), "../backend/src/types/work-team.ts"), "utf8");
    const fe = readFileSync(resolve(process.cwd(), "src/types/work-team.ts"), "utf8");
    assert.match(be, /interface WorkTeamUsageRecord \{[\s\S]*serviceId:/);
    assert.match(fe, /interface WorkTeamUsageRecord \{[\s\S]*serviceId:/);
  });

  it("DeactivationImpactAssignment includes workTeamId", () => {
    const fe = readFileSync(
      resolve(process.cwd(), "src/types/employee-deactivation.ts"),
      "utf8",
    );
    const be = readFileSync(
      resolve(process.cwd(), "../backend/src/utils/employee-deactivation-impact.ts"),
      "utf8",
    );
    assert.match(fe, /interface DeactivationImpactAssignment \{[\s\S]*workTeamId:/);
    assert.match(be, /interface DeactivationImpactRow \{[\s\S]*workTeamId:/);
  });

  it("statistics repository groups by service_id for operations", () => {
    const repo = readFileSync(
      resolve(process.cwd(), "../backend/src/repositories/statistics.repository.ts"),
      "utf8",
    );
    assert.match(repo, /GROUP BY operation_id, operation_kind, service_id, service_name/);
    assert.match(repo, /serviceId: record\.service_id/);
  });
});
