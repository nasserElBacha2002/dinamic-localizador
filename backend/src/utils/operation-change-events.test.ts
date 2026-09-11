import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOperationChangePayload,
  resolveOperationOperationalDate,
} from "./operation-change-events";
import type { Operation } from "../types/domain";

const op = (overrides: Partial<Operation> = {}): Operation => ({
  id: "11111111-1111-1111-1111-111111111111",
  serviceId: "22222222-2222-2222-2222-222222222222",
  operationKind: "ONE_TIME",
  scheduledStart: "2026-06-10T10:00:00.000Z",
  scheduledEnd: "2026-06-10T18:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  earlyToleranceSource: "COMPANY_DEFAULT",
  lateToleranceSource: "COMPANY_DEFAULT",
  status: "SCHEDULED",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("buildOperationChangePayload", () => {
  it("ignores no-op updates", () => {
    const current = op();
    assert.equal(
      buildOperationChangePayload({ previous: current, next: current, action: "update" }),
      null,
    );
  });

  it("records schedule changes as RESCHEDULE", () => {
    const previous = op();
    const next = op({ scheduledStart: "2026-06-11T10:00:00.000Z" });
    const payload = buildOperationChangePayload({ previous, next, action: "update" });
    assert.equal(payload?.changeAction, "RESCHEDULE");
    assert.ok(payload?.changedFields.includes("scheduledStart"));
  });

  it("records cancel and reactivate", () => {
    assert.equal(
      buildOperationChangePayload({
        previous: op(),
        next: op({ status: "CANCELLED" }),
        action: "cancel",
      })?.changeAction,
      "CANCEL",
    );
    assert.equal(
      buildOperationChangePayload({
        previous: op({ status: "CANCELLED" }),
        next: op({ status: "SCHEDULED" }),
        action: "reactivate",
      })?.changeAction,
      "REACTIVATE",
    );
  });
});

describe("resolveOperationOperationalDate", () => {
  const tz = "America/Argentina/Buenos_Aires";

  it("prefers explicit workDate", () => {
    assert.equal(
      resolveOperationOperationalDate(
        { scheduledStart: "2026-06-11T02:30:00.000Z", workDate: "2026-06-10" },
        tz,
      ),
      "2026-06-10",
    );
  });

  it("uses Buenos Aires calendar day near UTC midnight", () => {
    // 2026-06-11 02:30 UTC = 2026-06-10 23:30 in America/Argentina/Buenos_Aires (UTC-3)
    assert.equal(
      resolveOperationOperationalDate(
        { scheduledStart: "2026-06-11T02:30:00.000Z", workDate: null },
        tz,
      ),
      "2026-06-10",
    );
  });

  it("crosses into next BA day after local midnight", () => {
    // 2026-06-11 03:30 UTC = 2026-06-11 00:30 BA
    assert.equal(
      resolveOperationOperationalDate(
        { scheduledStart: "2026-06-11T03:30:00.000Z", workDate: null },
        tz,
      ),
      "2026-06-11",
    );
  });
});
