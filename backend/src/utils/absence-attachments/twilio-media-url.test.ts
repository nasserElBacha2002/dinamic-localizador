import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeTwilioMediaUrl } from "./twilio-media-url";
import { AppError } from "../../errors/app-error";

describe("assertSafeTwilioMediaUrl", () => {
  it("rejects non-https", async () => {
    await assert.rejects(
      () => assertSafeTwilioMediaUrl("http://api.twilio.com/media"),
      (error: unknown) => error instanceof AppError && error.code === "TWILIO_MEDIA_URL_INSECURE",
    );
  });

  it("rejects non-twilio hosts", async () => {
    await assert.rejects(
      () => assertSafeTwilioMediaUrl("https://evil.example/media"),
      (error: unknown) => error instanceof AppError && error.code === "TWILIO_MEDIA_HOST_FORBIDDEN",
    );
  });

  it("rejects private IP literals", async () => {
    await assert.rejects(
      () => assertSafeTwilioMediaUrl("https://127.0.0.1/media"),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "TWILIO_MEDIA_SSRF_BLOCKED" ||
          error.code === "TWILIO_MEDIA_HOST_FORBIDDEN"),
    );
  });
});
