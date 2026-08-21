import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  observabilityConversationIdParamSchema,
  observabilityListConversationsQuerySchema,
  observabilityListErrorsQuerySchema,
  observabilityListMessagesQuerySchema,
} from "./whatsapp-observability.schema";

describe("whatsapp observability schemas", () => {
  it("rejects invalid conversation UUID", () => {
    const result = observabilityConversationIdParamSchema.safeParse({
      conversationId: "not-a-uuid",
    });
    assert.equal(result.success, false);
  });

  it("rejects inverted date range", () => {
    const result = observabilityListConversationsQuerySchema.safeParse({
      from: "2026-08-02T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });

  it("accepts employeeId, status, flow, result, hasError, and activity bounds together", () => {
    const result = observabilityListConversationsQuerySchema.safeParse({
      employeeId: "2305D868-AF39-4154-8B75-0C854A799DF5",
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      hasError: "false",
      from: "2026-08-01T03:00:00.000Z",
      to: "2026-08-08T02:59:00.000Z",
      page: 1,
      limit: 20,
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.employeeId, "2305D868-AF39-4154-8B75-0C854A799DF5");
      assert.equal(result.data.hasError, false);
      assert.equal(result.data.status, "ACTIVE");
      assert.equal(result.data.flowType, "INBOUND_LOCATION");
      assert.equal(result.data.resultCode, "CHECKIN_COMPLETED");
    }
  });

  it("rejects date-only activity bounds (ISO datetime required)", () => {
    const result = observabilityListConversationsQuerySchema.safeParse({
      from: "2026-08-01",
      to: "2026-08-07",
    });
    assert.equal(result.success, false);
  });

  it("transforms hasError query strings to booleans", () => {
    assert.equal(
      observabilityListConversationsQuerySchema.safeParse({ hasError: "true" }).success,
      true,
    );
    assert.equal(
      observabilityListConversationsQuerySchema.parse({ hasError: "1" }).hasError,
      true,
    );
    assert.equal(
      observabilityListConversationsQuerySchema.parse({ hasError: "0" }).hasError,
      false,
    );
  });

  it("accepts allowed message limits", () => {
    for (const limit of [1, 50, 100]) {
      const result = observabilityListMessagesQuerySchema.safeParse({ limit });
      assert.equal(result.success, true, `limit=${limit}`);
      if (result.success) {
        assert.equal(result.data.limit, limit);
      }
    }
  });

  it("rejects invalid limits", () => {
    assert.equal(observabilityListMessagesQuerySchema.safeParse({ limit: -1 }).success, false);
    assert.equal(observabilityListMessagesQuerySchema.safeParse({ limit: 0 }).success, false);
    assert.equal(observabilityListMessagesQuerySchema.safeParse({ limit: 101 }).success, false);
    assert.equal(observabilityListMessagesQuerySchema.safeParse({ limit: 1.5 }).success, false);
    assert.equal(observabilityListMessagesQuerySchema.safeParse({ limit: "abc" }).success, false);
  });

  it("accepts a complete cursor", () => {
    const result = observabilityListMessagesQuerySchema.safeParse({
      limit: 50,
      beforeCreatedAt: "2026-01-01T12:00:00.000Z",
      beforeId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(result.success, true);
  });

  it("rejects partial cursor", () => {
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({
        beforeCreatedAt: "2026-01-01T12:00:00.000Z",
      }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({
        beforeId: "11111111-1111-4111-8111-111111111111",
      }).success,
      false,
    );
  });

  it("rejects invalid cursor values", () => {
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({
        beforeCreatedAt: "not-a-date",
        beforeId: "11111111-1111-4111-8111-111111111111",
      }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({
        beforeCreatedAt: "2026-01-01T12:00:00.000Z",
        beforeId: "not-a-uuid",
      }).success,
      false,
    );
  });

  it("rejects unknown direction", () => {
    const result = observabilityListMessagesQuerySchema.safeParse({
      direction: "SIDEWAYS",
    });
    assert.equal(result.success, false);
  });

  it("defaults message list limit", () => {
    const result = observabilityListMessagesQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.limit, 50);
      assert.equal(result.data.beforeCreatedAt, undefined);
      assert.equal(result.data.beforeId, undefined);
    }
  });

  it("rejects invalid employeeId and hasError on conversation list", () => {
    assert.equal(
      observabilityListConversationsQuerySchema.safeParse({ employeeId: "not-a-uuid" }).success,
      false,
    );
    assert.equal(
      observabilityListConversationsQuerySchema.safeParse({ hasError: "maybe" }).success,
      false,
    );
  });

  it("ignores removed phone/search query keys on conversation list", () => {
    const result = observabilityListConversationsQuerySchema.safeParse({
      phone: "+54911",
      search: "foo",
      employeeId: "2305D868-AF39-4154-8B75-0C854A799DF5",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal("phone" in result.data, false);
      assert.equal("search" in result.data, false);
      assert.equal(result.data.employeeId, "2305D868-AF39-4154-8B75-0C854A799DF5");
    }
  });

  it("requires ISO datetime for errors list from/to (same contract as conversations)", () => {
    assert.equal(
      observabilityListErrorsQuerySchema.safeParse({ from: "2026-08-01", to: "2026-08-07" })
        .success,
      false,
    );
    const ok = observabilityListErrorsQuerySchema.safeParse({
      from: "2026-08-01T03:00:00.000Z",
      to: "2026-08-08T02:59:00.000Z",
    });
    assert.equal(ok.success, true);
  });
});
