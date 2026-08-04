import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WHATSAPP_CONVERSATION_MESSAGES_MAX_LIMIT,
  WHATSAPP_CONVERSATION_MESSAGES_PAGE_SIZE,
} from "./whatsapp-observability-messages";

describe("whatsapp observability message page size contract", () => {
  it("keeps default page size within backend max", () => {
    assert.ok(WHATSAPP_CONVERSATION_MESSAGES_PAGE_SIZE <= WHATSAPP_CONVERSATION_MESSAGES_MAX_LIMIT);
    assert.equal(WHATSAPP_CONVERSATION_MESSAGES_MAX_LIMIT, 100);
    assert.equal(WHATSAPP_CONVERSATION_MESSAGES_PAGE_SIZE, 50);
  });
});
