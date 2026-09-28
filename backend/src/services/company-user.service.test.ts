import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { roleHasPermission } from "../constants/company-permissions";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { UserCompanyMembership } from "../types/company";
import { TWO_FACTOR_USER_DEFAULTS } from "../types/auth";

const activeCompany = {
  id: "company-1",
  name: "Co",
  legalName: null,
  taxId: null,
  country: null,
  defaultTimezone: "America/Argentina/Buenos_Aires",
  status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const membership = (
  overrides: Partial<UserCompanyMembership> & Pick<UserCompanyMembership, "userId" | "role">,
): UserCompanyMembership => ({
  id: "membership-1",
  companyId: "company-1",
  status: "ACTIVE",
  isDefault: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("company user service rules", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("OWNER has users:manage permission", () => {
    assert.equal(roleHasPermission("OWNER", "users:manage"), true);
  });

  it("READ_ONLY cannot manage users", () => {
    assert.equal(roleHasPermission("READ_ONLY", "users:manage"), false);
  });

  it("create issues an invitation and never returns credentials", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyUserService } = await import("./company-user.service");
    const { userInvitationService } = await import("./user-invitation.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(auditService, "log", async () => undefined);
    mock.method(userInvitationService, "issueInvitation", async (input) => {
      assert.equal(input.canAssignOwner, true);
      assert.equal(input.role, "ADMIN");
      return {
        invitation: {
          id: "inv-1",
          companyId: "company-1",
          emailNormalized: "new@example.com",
          inviteeName: "New User",
          role: "ADMIN",
          invitedByUserId: "actor-1",
          targetUserId: null,
          tokenHash: "a".repeat(64),
          tokenVersion: 1,
          status: "PENDING",
          origin: "MANUAL",
          expiresAt: new Date().toISOString(),
          acceptedAt: null,
          revokedAt: null,
          lastEmailSentAt: new Date().toISOString(),
          lastEmailError: null,
          lastEmailErrorCode: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        emailSent: true,
        publicErrorCode: null,
        reusedPending: false,
        message: "Invitación enviada por correo.",
      };
    });

    const result = await companyUserService.create(
      "company-1",
      { name: "New User", email: "new@example.com", role: "ADMIN" },
      "actor-1",
      false,
      "OWNER",
    );

    assert.equal(result.data.invitationId, "inv-1");
    assert.equal(result.data.emailSent, true);
    assert.equal("temporaryPassword" in result, false);
    assert.equal("passwordHash" in result.data, false);
    assert.equal(JSON.stringify(result).includes("password"), false);
  });

  it("OWNER can invite another OWNER", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyUserService } = await import("./company-user.service");
    const { userInvitationService } = await import("./user-invitation.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(auditService, "log", async () => undefined);
    let issuedRole: string | null = null;
    mock.method(userInvitationService, "issueInvitation", async (input) => {
      issuedRole = input.role;
      assert.equal(input.canAssignOwner, true);
      return {
        invitation: {
          id: "inv-owner",
          companyId: "company-1",
          emailNormalized: "owner2@example.com",
          inviteeName: "Owner Two",
          role: "OWNER",
          invitedByUserId: "actor-1",
          targetUserId: null,
          tokenHash: "b".repeat(64),
          tokenVersion: 1,
          status: "PENDING",
          origin: "MANUAL",
          expiresAt: new Date().toISOString(),
          acceptedAt: null,
          revokedAt: null,
          lastEmailSentAt: new Date().toISOString(),
          lastEmailError: null,
          lastEmailErrorCode: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        emailSent: true,
        publicErrorCode: null,
        reusedPending: false,
        message: "Invitación enviada por correo.",
      };
    });

    const result = await companyUserService.create(
      "company-1",
      { name: "Owner Two", email: "owner2@example.com", role: "OWNER" },
      "actor-1",
      false,
      "OWNER",
    );
    assert.equal(issuedRole, "OWNER");
    assert.equal(result.data.invitationId, "inv-owner");
  });

  it("ADMIN cannot invite ADMIN", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () =>
        companyUserService.create(
          "company-1",
          { name: "Peer", email: "peer@example.com", role: "ADMIN" },
          "actor-1",
          false,
          "ADMIN",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("create propagates membership-already-exists from invitation service", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyUserService } = await import("./company-user.service");
    const { userInvitationService } = await import("./user-invitation.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userInvitationService, "issueInvitation", async () => {
      throw new AppError(
        409,
        "MEMBERSHIP_ALREADY_EXISTS",
        "El usuario ya tiene acceso activo a esta empresa.",
      );
    });

    await assert.rejects(
      () =>
        companyUserService.create(
          "company-1",
          { name: "User", email: "user@example.com", role: "ADMIN" },
          "actor-1",
          false,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "MEMBERSHIP_ALREADY_EXISTS",
    );
  });

  it("blocks demoting the last active OWNER", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "owner-1",
      name: "Owner",
      email: "owner@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({
          existing: membership({ userId: "owner-1", role: "OWNER", isDefault: true }),
          actorRole: "OWNER",
          actorIsPlatformAdmin: true,
        });
        throw new AppError(
          409,
          "LAST_OWNER_PROTECTED",
          "No se puede quitar o degradar al último dueño activo de la empresa.",
        );
      },
    );
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "owner-1",
          { role: "ADMIN" },
          "requester-1",
          true,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "LAST_OWNER_PROTECTED",
    );
  });

  it("blocks peer-rank company user role update", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "peer-1",
      name: "Peer",
      email: "peer@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({ existing: membership({ userId: "peer-1", role: "OWNER" }), actorRole: "OWNER", actorIsPlatformAdmin: false });
        throw new Error("should not continue after hierarchy denial");
      },
    );
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "peer-1",
          { role: "ADMIN" },
          "actor-1",
          false,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ROLE_HIERARCHY",
    );
  });

  it("allows superior actor to update inferior membership", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, patch, validate) => {
        const existing = membership({ userId: "admin-1", role: "ADMIN" });
        validate({ existing, actorRole: "OWNER", actorIsPlatformAdmin: false });
        return {
          previous: existing,
          updated: { ...existing, role: patch.membership?.role ?? existing.role },
          row: {
            user_id: "admin-1",
            name: "Admin",
            email: "admin@example.com",
            global_role: "ADMIN",
            is_platform_admin: false,
            membership_id: "membership-1",
            company_id: "company-1",
            company_role: "HR",
            membership_status: "ACTIVE",
            is_default: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login_at: null,
          },
          actorRole: "OWNER",
          actorIsPlatformAdmin: false,
        };
      },
    );
    mock.method(auditService, "log", async () => undefined);

    const updated = await companyUserService.update(
      "company-1",
      "admin-1",
      { role: "HR" },
      "owner-1",
      false,
      "OWNER",
    );
    assert.equal(updated.companyRole, "HR");
  });

  it("blocks regular user from modifying platform superadmin", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "platform-1",
      name: "Platform Admin",
      email: "admin@dinamicsystems.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: true,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "platform-1",
          { role: "READ_ONLY" },
          "requester-1",
          false,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "PLATFORM_ADMIN_PROTECTED",
    );
  });

  it("allows self profile updates while remaining active", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "self-1",
      name: "Self",
      email: "self@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(userRepository, "updateProfileFields", async () => undefined);
    mock.method(userRepository, "updatePhoneNumber", async () => undefined);
    mock.method(auditService, "log", async () => undefined);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, patch, validate, beforeCommit) => {
        const existing = membership({
          userId: "self-1",
          role: "OWNER",
          status: "ACTIVE",
          isDefault: true,
        });
        validate({ existing, actorRole: "OWNER", actorIsPlatformAdmin: false });
        const row = {
          user_id: "self-1",
          name: "Self Updated",
          email: "self.new@example.com",
          phone_number: "+5491111111111",
          global_role: "ADMIN",
          is_platform_admin: false,
          membership_id: "membership-1",
          company_id: "company-1",
          company_role: "OWNER",
          membership_status: patch.membership?.status ?? "ACTIVE",
          is_default: patch.membership?.isDefault ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login_at: null,
        };
        if (beforeCommit) {
          await beforeCommit({
            transaction: {} as never,
            previous: existing,
            updated: { ...existing, ...(patch.membership ?? {}) },
            row,
            actorRole: "OWNER",
            actorIsPlatformAdmin: false,
          });
        }
        return { previous: existing, updated: { ...existing, ...(patch.membership ?? {}) }, row };
      },
    );

    const updated = await companyUserService.update(
      "company-1",
      "self-1",
      {
        name: "Self Updated",
        email: "self.new@example.com",
        phoneNumber: "+5491111111111",
        status: "ACTIVE",
        isDefault: true,
      },
      "self-1",
      false,
      "OWNER",
    );

    assert.equal(updated.name, "Self Updated");
    assert.equal(updated.email, "self.new@example.com");
    assert.equal(updated.phoneNumber, "+5491111111111");
    assert.equal(updated.membershipStatus, "ACTIVE");
  });

  it("allows profile-only update without status field (no accidental inactivation)", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    let sawMembershipPatch = false;
    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "self-1",
      name: "Self",
      email: "self@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(auditService, "log", async () => undefined);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, patch, validate, beforeCommit) => {
        if (patch.membership) {
          sawMembershipPatch = true;
        }
        const existing = membership({
          userId: "self-1",
          role: "ADMIN",
          status: "ACTIVE",
          isDefault: false,
        });
        validate({ existing, actorRole: "ADMIN", actorIsPlatformAdmin: false });
        const row = {
          user_id: "self-1",
          name: "Renamed",
          email: "self@example.com",
          phone_number: null,
          global_role: "ADMIN",
          is_platform_admin: false,
          membership_id: "membership-1",
          company_id: "company-1",
          company_role: "ADMIN",
          membership_status: "ACTIVE",
          is_default: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_login_at: null,
        };
        if (beforeCommit) {
          await beforeCommit({
            transaction: {} as never,
            previous: existing,
            updated: existing,
            row,
            actorRole: "ADMIN",
            actorIsPlatformAdmin: false,
          });
        }
        return {
          previous: existing,
          updated: existing,
          row,
          actorRole: "ADMIN",
          actorIsPlatformAdmin: false,
        };
      },
    );

    const updated = await companyUserService.update(
      "company-1",
      "self-1",
      { name: "Renamed" },
      "self-1",
      false,
      "ADMIN",
    );
    assert.equal(updated.name, "Renamed");
    assert.equal(updated.membershipStatus, "ACTIVE");
    assert.equal(sawMembershipPatch, false);
  });

  it("blocks self deactivation even when personal fields are included", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "super-1",
      name: "Super",
      email: "super@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: true,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({ existing: membership({ userId: "super-1", role: "OWNER", status: "ACTIVE" }), actorRole: "OWNER", actorIsPlatformAdmin: false });
        throw new Error("should not write after self deactivation denial");
      },
    );
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "super-1",
          { name: "Super", status: "INACTIVE" },
          "super-1",
          true,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_DEACTIVATION_NOT_ALLOWED",
    );
  });

  it("blocks peer and superior inactivation; allows inferior", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "target-1",
      name: "Target",
      email: "target@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(auditService, "log", async () => undefined);

    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({ existing: membership({ userId: "target-1", role: "ADMIN", status: "ACTIVE" }), actorRole: "ADMIN", actorIsPlatformAdmin: false });
        throw new Error("stop");
      },
    );
    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "target-1",
          { status: "INACTIVE" },
          "actor-1",
          false,
          "ADMIN",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
    );

    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({ existing: membership({ userId: "target-1", role: "OWNER", status: "ACTIVE" }), actorRole: "OWNER", actorIsPlatformAdmin: false });
        throw new Error("stop");
      },
    );
    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "target-1",
          { status: "INACTIVE" },
          "actor-1",
          false,
          "ADMIN",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
    );

    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, patch, validate) => {
        const existing = membership({ userId: "target-1", role: "HR", status: "ACTIVE" });
        validate({ existing, actorRole: "ADMIN", actorIsPlatformAdmin: false });
        return {
          previous: existing,
          updated: { ...existing, status: "INACTIVE" as const },
          row: {
            user_id: "target-1",
            name: "Target",
            email: "target@example.com",
            global_role: "ADMIN",
            is_platform_admin: false,
            membership_id: "membership-1",
            company_id: "company-1",
            company_role: "HR",
            membership_status: patch.membership?.status ?? "INACTIVE",
            is_default: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login_at: null,
          },
          actorRole: "ADMIN",
          actorIsPlatformAdmin: false,
        };
      },
    );
    const inactivated = await companyUserService.update(
      "company-1",
      "target-1",
      { status: "INACTIVE" },
      "actor-1",
      false,
      "ADMIN",
    );
    assert.equal(inactivated.membershipStatus, "INACTIVE");
  });

  it("uses locked membership status so stale ACTIVE cannot bypass inactivation rules", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "self-1",
      name: "Self",
      email: "self@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(auditService, "log", async () => undefined);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        // Concurrent path: lock sees ACTIVE and still enforces self-deactivation.
        validate({ existing: membership({ userId: "self-1", role: "ADMIN", status: "ACTIVE" }), actorRole: "ADMIN", actorIsPlatformAdmin: false });
        throw new Error("should not write");
      },
    );

    await assert.rejects(
      () =>
        companyUserService.deactivate(
          "company-1",
          "self-1",
          "self-1",
          false,
          "ADMIN",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_DEACTIVATION_NOT_ALLOWED",
    );
  });

  it("blocks third-party personal profile edits for company admins", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "target-1",
      name: "Target",
      email: "target@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(auditService, "log", async () => undefined);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({
          existing: membership({ userId: "target-1", role: "HR", status: "ACTIVE" }),
          actorRole: "OWNER",
          actorIsPlatformAdmin: false,
        });
        throw new Error("should not write after profile denial");
      },
    );

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "target-1",
          { name: "Hacked", email: "hacked@example.com" },
          "owner-1",
          false,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "USER_UPDATE_FORBIDDEN",
    );
  });

  it("maps duplicate email pre-check and SQL unique violation to EMAIL_ALREADY_EXISTS", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "self-1",
      name: "Self",
      email: "self@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => ({
      id: "other-1",
      name: "Other",
      email: "taken@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "self-1",
          { email: "taken@example.com" },
          "self-1",
          false,
          "ADMIN",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMAIL_ALREADY_EXISTS",
    );

    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async () => {
        const err = Object.assign(new Error("Violation of UNIQUE KEY constraint 'UQ_users_email'"), {
          number: 2627,
        });
        throw err;
      },
    );

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "self-1",
          { email: "race@example.com" },
          "self-1",
          false,
          "ADMIN",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMAIL_ALREADY_EXISTS",
    );
  });

  it("deactivate endpoint reuses the same inactivation policy as update", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "target-1",
      name: "Target",
      email: "target@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(auditService, "log", async () => undefined);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        validate({
          existing: membership({ userId: "target-1", role: "ADMIN", status: "ACTIVE" }),
          actorRole: "ADMIN",
          actorIsPlatformAdmin: false,
        });
        throw new Error("stop");
      },
    );

    await assert.rejects(
      () =>
        companyUserService.deactivate("company-1", "target-1", "actor-1", false, "ADMIN"),
      (error: unknown) =>
        error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
    );
  });

  it("uses locked actor role so a demoted requester loses privileges", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { auditService } = await import("./audit.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(userRepository, "findById", async () => ({
      id: "target-1",
      name: "Target",
      email: "target@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      tokenVersion: 0,
      ...TWO_FACTOR_USER_DEFAULTS,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(auditService, "log", async () => undefined);
    mock.method(
      userCompanyMembershipRepository,
      "applyCompanyUserUpdateWithGuards",
      async (_companyId, _userId, _actorId, _patch, validate) => {
        // Snapshot said OWNER; lock sees demoted ADMIN (peer of target).
        validate({
          existing: membership({ userId: "target-1", role: "ADMIN", status: "ACTIVE" }),
          actorRole: "ADMIN",
          actorIsPlatformAdmin: false,
        });
        throw new Error("stop");
      },
    );

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "target-1",
          { status: "INACTIVE" },
          "actor-1",
          false,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
    );
  });
});
