import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sendEmail } from "./email.service";

describe("email.service", () => {
  it("does not report console transport as delivered", async () => {
    const result = await sendEmail({
      to: "user@example.com",
      subject: "Test",
      text: "hello token=abcdefghijklmnopqrstuvwxyz0123456789abcd",
      html: "<p>hello</p>",
    });

    assert.equal(result.transport, "console");
    assert.equal(result.sent, false);
    assert.equal(result.publicErrorCode, "EMAIL_CONSOLE_NOT_DELIVERED");
  });
});
