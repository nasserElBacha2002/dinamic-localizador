import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  observabilityConversationIdParamSchema,
  observabilityListConversationsQuerySchema,
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
});
