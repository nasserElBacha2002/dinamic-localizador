import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTEGRATION_PLATFORM_ADMIN_EMAIL_DEFAULT,
  resolveIntegrationPlatformAdminEmail,
} from "./integration-platform-admin";

describe("integration platform admin email", () => {
  it("defaults to migration/seed canonical email", () => {
    const backup = process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_EMAIL;
    assert.equal(resolveIntegrationPlatformAdminEmail(), INTEGRATION_PLATFORM_ADMIN_EMAIL_DEFAULT);
    if (backup === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = backup;
    }
  });

  it("normalizes ADMIN_EMAIL from env", () => {
    const backup = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = "  Admin@Example.COM ";
    assert.equal(resolveIntegrationPlatformAdminEmail(), "admin@example.com");
    if (backup === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = backup;
    }
  });
});