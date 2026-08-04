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

  it("rejects invalid page and excessive limit", () => {
    assert.equal(
      observabilityListConversationsQuerySchema.safeParse({ page: "NaN" }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({ limit: -1 }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({ limit: 0 }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({ limit: 101 }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({ limit: 1000 }).success,
      false,
    );
    assert.equal(
      observabilityListMessagesQuerySchema.safeParse({ limit: "abc" }).success,
      false,
    );
  });

  it("rejects unknown direction", () => {
    const result = observabilityListMessagesQuerySchema.safeParse({
      direction: "SIDEWAYS",
    });
    assert.equal(result.success, false);
  });

  it("accepts valid list query defaults", () => {
    const result = observabilityListConversationsQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 1);
      assert.equal(result.data.limit, 20);
    }
  });

  it("defaults message list page and limit", () => {
    const result = observabilityListMessagesQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 1);
      assert.equal(result.data.limit, 50);
    }
  });
});
