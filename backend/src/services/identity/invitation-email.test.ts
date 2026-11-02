import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../../config/env";
import { buildInvitationAcceptUrl, buildInvitationEmail } from "./invitation-email";

describe("invitation-email", () => {
  const originalUrl = env.FRONTEND_URL;

  afterEach(() => {
    (env as { FRONTEND_URL: string }).FRONTEND_URL = originalUrl;
  });

  it("builds accept URL from FRONTEND_URL without leaking token into subject", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";
    const url = buildInvitationAcceptUrl(token);
    assert.match(url, /\/invitations\/accept\?token=/);
    assert.ok(url.includes(encodeURIComponent(token)));

    const email = buildInvitationEmail({
      to: "user@example.com",
      companyName: "Acme <Corp>",
      inviteeName: "Ana",
      userExists: false,
      origin: "MANUAL",
      expiresAt: new Date("2030-01-01T12:00:00.000Z"),
      rawToken: token,
    });

    assert.match(email.subject, /Acme/);
    assert.equal(email.subject.includes(token), false);
    assert.match(email.html, /&lt;Corp&gt;/);
    assert.match(email.text, /crear tu cuenta/i);
    assert.equal(email.html.includes("no-referrer"), true);
  });

  it("preserves invitation token when FRONTEND_URL is app subdomain", () => {
    (env as { FRONTEND_URL: string }).FRONTEND_URL = "https://app.dinamicoperations.com";
    const token = "invite-token-xyz";
    const url = buildInvitationAcceptUrl(token);
    assert.equal(
      url,
      `https://app.dinamicoperations.com/invitations/accept?token=${encodeURIComponent(token)}`,
    );
  });

  it("uses existing-user copy when userExists", () => {
    const email = buildInvitationEmail({
      to: "user@example.com",
      companyName: "Acme",
      inviteeName: null,
      userExists: true,
      origin: "MANUAL",
      expiresAt: new Date("2030-01-01T12:00:00.000Z"),
      rawToken: "abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    });
    assert.match(email.text, /cuenta actual/i);
  });

  it("uses owner copy for COMPANY_CREATE origin", () => {
    const email = buildInvitationEmail({
      to: "owner@example.com",
      companyName: "Nueva SA",
      inviteeName: "Dueño",
      userExists: false,
      origin: "COMPANY_CREATE",
      expiresAt: new Date("2030-01-01T12:00:00.000Z"),
      rawToken: "abcdefghijklmnopqrstuvwxyz0123456789ABCD",
    });
    assert.match(email.subject, /dueño/i);
  });
});
