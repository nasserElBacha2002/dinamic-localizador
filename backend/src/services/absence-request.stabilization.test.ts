import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { connectDatabase, closeDatabase } from "../database/connection";
import { isAbsenceCancelIntent } from "../utils/absence-intent";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { absenceRequestService } from "./absence-request.service";

describe("absence request stabilization", () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  it("lists absence requests with PENDING filter without SQL errors", async () => {
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
    const inventories = await absenceRequestRepository.findAffectedInventories(
      "00000000-0000-0000-0000-000000000000",
      new Date("2026-01-01T03:00:00.000Z"),
      new Date("2026-01-02T02:59:59.999Z"),
    );

    assert.ok(Array.isArray(inventories));
  });

  it("forces admin create path to ignore client requestedVia", () => {
    const adminCreate = absenceRequestService.createFromAdmin.toString();
    assert.match(adminCreate, /requestedVia:\s*"ADMIN"/);
    assert.match(adminCreate, /sourceMessageSid:\s*null/);
  });

  it("recognizes global cancel intent for active bot sessions", () => {
    assert.equal(isAbsenceCancelIntent("Cancelar"), true);
    assert.equal(isAbsenceCancelIntent("cancelar flujo"), true);
    assert.equal(isAbsenceCancelIntent("Llegué"), false);
  });
});
