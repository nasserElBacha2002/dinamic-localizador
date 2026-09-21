import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

describe("invitation preview + token lifecycle", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("preferred POST preview body schema accepts token", async () => {
    const { previewInvitationBodySchema } = await import("../schemas/user-invitation.schema");
    const token = "a".repeat(32);
    assert.equal(previewInvitationBodySchema.parse({ token }).token, token);
  });

  it("legacy GET preview query schema still accepts token while supported", async () => {
    const { previewInvitationQuerySchema } = await import("../schemas/user-invitation.schema");
    const token = "b".repeat(32);
    assert.equal(previewInvitationQuerySchema.parse({ token }).token, token);
  });

  it("service.preview returns INVALID for unknown token", async () => {
    const { userInvitationRepository } = await import(
      "../repositories/user-invitation.repository"
    );
    const { userInvitationService } = await import("./user-invitation.service");

    mock.method(userInvitationRepository, "findByTokenHash", async () => null);

    const preview = await userInvitationService.preview("x".repeat(40));
    assert.equal(preview.status, "INVALID");
  });

  it("service.preview rejects expired pending invitation (returns INVALID)", async () => {
    const { userInvitationRepository } = await import(
      "../repositories/user-invitation.repository"
    );
    const { userInvitationService } = await import("./user-invitation.service");
    const { auditService } = await import("./audit.service");

    mock.method(userInvitationRepository, "findByTokenHash", async () => ({
      id: "inv-1",
      companyId: "c1",
      emailNormalized: "a@example.com",
      role: "OPERATOR",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      acceptedAt: null,
      inviteeName: null,
      origin: "MANUAL",
      createdAt: new Date().toISOString(),
    }));
    mock.method(userInvitationRepository, "markExpiredIfPending", async () => true);
    mock.method(auditService, "log", async () => undefined);

    const preview = await userInvitationService.preview("y".repeat(40));
    assert.equal(preview.status, "INVALID");
  });

  it("service.preview rejects already-accepted token (replay surface)", async () => {
    const { userInvitationRepository } = await import(
      "../repositories/user-invitation.repository"
    );
    const { userInvitationService } = await import("./user-invitation.service");

    mock.method(userInvitationRepository, "findByTokenHash", async () => ({
      id: "inv-1",
      companyId: "c1",
      emailNormalized: "a@example.com",
      role: "OPERATOR",
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      acceptedAt: new Date().toISOString(),
      inviteeName: null,
      origin: "MANUAL",
      createdAt: new Date().toISOString(),
    }));

    const preview = await userInvitationService.preview("z".repeat(40));
    assert.equal(preview.status, "INVALID");
  });
});
