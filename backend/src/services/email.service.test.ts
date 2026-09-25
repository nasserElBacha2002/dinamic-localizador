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

  it("accepts optional XLSX attachments without changing console semantics", async () => {
    const result = await sendEmail({ to: "user@example.com", subject: "Report", text: "body", html: "<p>body</p>", attachments: [{ filename: "report.xlsx", content: Buffer.from("xlsx"), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] });
    assert.equal(result.sent, false);
    assert.equal(result.transport, "console");
  });
});
