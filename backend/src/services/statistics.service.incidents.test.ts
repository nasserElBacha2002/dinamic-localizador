import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveIncidentMetricsSettlement } from "./statistics.service";
import { emptyOperationalIncidentSummary } from "../utils/operational-incident-statistics";

describe("statisticsService incident partial failure", () => {
  it("maps rejected incident settlement to UNAVAILABLE without zeros", () => {
    const resolved = resolveIncidentMetricsSettlement(
      { status: "rejected", reason: new Error("incident query failed") },
      "00000000-0000-4000-8000-000000000001",
    );
    assert.equal(resolved.operationalIncidents, null);
    assert.equal(resolved.operationalIncidentsStatus, "UNAVAILABLE");
  });

  it("maps fulfilled incident settlement to AVAILABLE", () => {
    const metrics = emptyOperationalIncidentSummary();
    const resolved = resolveIncidentMetricsSettlement(
      { status: "fulfilled", value: metrics },
      "00000000-0000-4000-8000-000000000001",
    );
    assert.equal(resolved.operationalIncidents, metrics);
    assert.equal(resolved.operationalIncidentsStatus, "AVAILABLE");
  });
});
