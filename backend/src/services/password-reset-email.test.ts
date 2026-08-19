import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../config/env";
import { buildPasswordResetEmail, buildPasswordResetUrl } from "../services/password-reset-email";
import { generateOpaqueToken, redactOpaqueSecrets } from "../utils/opaque-token";

describe("password-reset-email", () => {
  const originalUrl = env.FRONTEND_URL;

  afterEach(() => {
    (env as { FRONTEND_URL: string }).FRONTEND_URL = originalUrl;
  });

  it("builds the reset URL from FRONTEND_URL, not the request host", () => {
    (env as { FRONTEND_URL: string }).FRONTEND_URL = "https://panel.dinamic.example";
    const token = generateOpaqueToken();
    const url = buildPasswordResetUrl(token);
    assert.equal(url.startsWith("https://panel.dinamic.example/reset-password?token="), true);
    assert.equal(url.includes("evil"), false);
  });

  it("mentions expiry and ignore-if-unsolicited copy", () => {
    const token = generateOpaqueToken();
    const email = buildPasswordResetEmail({
      to: "user@example.com",
      expiresAt: new Date("2026-08-19T15:00:00.000Z"),
      rawToken: token,
    });
    assert.match(email.subject, /contraseña/i);
    assert.match(email.text, /ignorá este mensaje/i);
    assert.match(email.text, /vence/i);
    assert.equal(redactOpaqueSecrets(email.text).includes(token), false);
  });
});
