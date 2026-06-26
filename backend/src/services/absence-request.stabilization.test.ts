import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { isAbsenceCancelIntent } from "../utils/absence-intent";

describe("absence request stabilization", () => {
  it("recognizes global cancel intent for active bot sessions", () => {
    assert.equal(isAbsenceCancelIntent("Cancelar"), true);
    assert.equal(isAbsenceCancelIntent("cancelar flujo"), true);
    assert.equal(isAbsenceCancelIntent("Llegué"), false);
  });
});

describeDatabaseIntegration("absence request stabilization (database)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("lists absence requests with PENDING filter without SQL errors", async () => {
    const { absenceRequestRepository } = await import("../repositories/absence-request.repository");
    const result = await absenceRequestRepository.list({
      page: 1,
      limit: 10,
      status: "PENDING",
    });

    assert.ok(Array.isArray(result.items));
    assert.equal(typeof result.total, "number");
    assert.ok(result.total >= 0);
  });

  it("returns paginated list response shape from service", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const result = await absenceRequestService.list({
      page: 1,
      limit: 10,
      status: "PENDING",
    });

    assert.ok(Array.isArray(result.data));
    assert.equal(result.meta.page, 1);
    assert.equal(result.meta.limit, 10);
    assert.equal(typeof result.meta.total, "number");
    for (const item of result.data) {
      assert.equal(typeof item.affectedInventoriesCount, "number");
      assert.ok(item.affectedInventoriesCount >= 0);
    }
  });

  it("findAffectedInventories tolerates inventories without scheduled_start", async () => {
    const { absenceRequestRepository } = await import("../repositories/absence-request.repository");
    const inventories = await absenceRequestRepository.findAffectedInventories(
      "00000000-0000-0000-0000-000000000000",
      new Date("2026-01-01T03:00:00.000Z"),
      new Date("2026-01-02T02:59:59.999Z"),
    );

    assert.ok(Array.isArray(inventories));
  });

  it("forces admin create path to ignore client requestedVia", async () => {
    const { absenceRequestService } = await import("./absence-request.service");
    const adminCreate = absenceRequestService.createFromAdmin.toString();
    assert.match(adminCreate, /requestedVia:\s*"ADMIN"/);
    assert.match(adminCreate, /sourceMessageSid:\s*null/);
  });
});
