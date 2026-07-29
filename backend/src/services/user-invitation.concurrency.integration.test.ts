import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  requireDinamicCompanyId,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { generateInvitationToken, hashInvitationToken } from "../utils/invitation-token";
import { normalizeEmail } from "../utils/password";

/**
 * SQL Server integration for invitation locking / token rotation.
 * Enable: RUN_DB_INTEGRATION_TESTS=true npm run test:integration
 */
describeDatabaseIntegration("user invitations concurrency", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("rotates token at most once under concurrent resend locks", async () => {
    const { getPool } = await import("../database/connection");
    const { userInvitationRepository } = await import(
      "../repositories/user-invitation.repository"
    );
    const { userInvitationService } = await import("../services/user-invitation.service");
    const sql = (await import("mssql")).default;

    const companyId = await requireDinamicCompanyId();
    const email = normalizeEmail(
      `invite.concurrent.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const invitation = await userInvitationRepository.create({
      companyId,
      emailNormalized: email,
      inviteeName: "Concurrent Invitee",
      role: "ADMIN",
      invitedByUserId: null,
      targetUserId: null,
      tokenHash,
      origin: "MANUAL",
      expiresAt,
    });

    try {
      const [first, second] = await Promise.allSettled([
        userInvitationService.resend(companyId, invitation.id, "00000000-0000-0000-0000-000000000001"),
        userInvitationService.resend(companyId, invitation.id, "00000000-0000-0000-0000-000000000001"),
      ]);

      const fulfilled = [first, second].filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof userInvitationService.resend>>> =>
          result.status === "fulfilled",
      );
      assert.ok(fulfilled.length >= 1);

      const rotated = fulfilled.filter((result) => result.value.invitation.tokenVersion > 1);
      const inProgress = fulfilled.filter(
        (result) => result.value.publicErrorCode === "EMAIL_SEND_IN_PROGRESS",
      );

      // Exactly one rotation wins; the other is conflict or in-progress skip.
      assert.ok(rotated.length <= 1 || inProgress.length >= 1);

      const latest = await userInvitationRepository.findById(invitation.id);
      assert.ok(latest);
      assert.notEqual(latest.tokenHash, tokenHash);
      assert.ok(latest.tokenVersion >= 2);
    } finally {
      const pool = getPool();
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, invitation.id)
        .query("DELETE FROM user_invitations WHERE id = @id");
    }
  });

  it("accepts a new-user invitation transactionally", async () => {
    const { getPool } = await import("../database/connection");
    const { userInvitationRepository } = await import(
      "../repositories/user-invitation.repository"
    );
    const { userInvitationService } = await import("../services/user-invitation.service");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const sql = (await import("mssql")).default;

    const companyId = await requireDinamicCompanyId();
    const email = normalizeEmail(
      `invite.accept.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
    );
    const rawToken = generateInvitationToken();
    const invitation = await userInvitationRepository.create({
      companyId,
      emailNormalized: email,
      inviteeName: "Accept Invitee",
      role: "OPERATOR",
      invitedByUserId: null,
      targetUserId: null,
      tokenHash: hashInvitationToken(rawToken),
      origin: "MANUAL",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    let userId: string | null = null;
    try {
      const result = await userInvitationService.accept({
        rawToken,
        newUser: {
          name: "Accept Invitee",
          password: "secure-password-1",
          passwordConfirmation: "secure-password-1",
        },
      });

      assert.equal(result.invitationAccepted, true);
      assert.equal(result.data.alreadyMember, false);
      userId = result.data.userId;

      const membership = await userCompanyMembershipRepository.findMembership(userId, companyId);
      assert.equal(membership?.status, "ACTIVE");
      assert.equal(membership?.role, "OPERATOR");

      const second = await userInvitationService.accept({
        rawToken,
        newUser: {
          name: "Accept Invitee",
          password: "secure-password-1",
          passwordConfirmation: "secure-password-1",
        },
      }).catch((error: unknown) => error);

      assert.ok(second instanceof Error);
    } finally {
      const pool = getPool();
      await pool
        .request()
        .input("invitationId", sql.UniqueIdentifier, invitation.id)
        .query("DELETE FROM audit_logs WHERE entity_id = @invitationId");
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, invitation.id)
        .query("DELETE FROM user_invitations WHERE id = @id");
      if (userId) {
        await pool
          .request()
          .input("userId", sql.UniqueIdentifier, userId)
          .query("DELETE FROM audit_logs WHERE user_id = @userId OR entity_id = @userId");
        await pool
          .request()
          .input("userId", sql.UniqueIdentifier, userId)
          .input("companyId", sql.UniqueIdentifier, companyId)
          .query(
            "DELETE FROM user_company_memberships WHERE user_id = @userId AND company_id = @companyId",
          );
        await pool
          .request()
          .input("userId", sql.UniqueIdentifier, userId)
          .query("DELETE FROM users WHERE id = @userId");
      }
    }
  });
});
