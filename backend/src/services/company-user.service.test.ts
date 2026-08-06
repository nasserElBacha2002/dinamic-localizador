import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { roleHasPermission } from "../constants/company-permissions";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import type { UserCompanyMembership } from "../types/company";

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
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      userCompanyMembershipRepository,
      "applyMembershipUpdateWithGuards",
      async (_companyId, _userId, _patch, validate) => {
        validate(membership({ userId: "owner-1", role: "OWNER", isDefault: true }));
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

  it("blocks peer-rank company user update", async () => {
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
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      userCompanyMembershipRepository,
      "applyMembershipUpdateWithGuards",
      async (_companyId, _userId, _patch, validate) => {
        validate(membership({ userId: "peer-1", role: "OWNER" }));
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
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(
      userCompanyMembershipRepository,
      "applyMembershipUpdateWithGuards",
      async (_companyId, _userId, patch, validate) => {
        const existing = membership({ userId: "admin-1", role: "ADMIN" });
        validate(existing);
        return {
          previous: existing,
          updated: { ...existing, role: patch.role ?? existing.role },
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

  it("blocks platform admin self-update before any membership write", async () => {
    setupUnitTestEnv();
    const { companyUserService } = await import("./company-user.service");
    const { companyRepository } = await import("../repositories/company.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { auditService } = await import("./audit.service");

    let updateCalls = 0;
    let auditAction: string | null = null;
    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(
      userCompanyMembershipRepository,
      "applyMembershipUpdateWithGuards",
      async () => {
        updateCalls += 1;
        throw new Error("should not write");
      },
    );
    mock.method(auditService, "log", async (_companyId, input) => {
      auditAction = input.action;
    });

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "super-1",
          { role: "ADMIN", status: "INACTIVE", isDefault: false },
          "super-1",
          true,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "SELF_EDIT_NOT_ALLOWED" &&
        error.message.includes("otro usuario autorizado"),
    );
    assert.equal(updateCalls, 0);
    assert.equal(auditAction, "company_user_self_edit_denied");
  });

  it("blocks platform admin self-deactivate", async () => {
    setupUnitTestEnv();
    const { companyUserService } = await import("./company-user.service");
    const { companyRepository } = await import("../repositories/company.repository");
    const { auditService } = await import("./audit.service");
    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(auditService, "log", async () => undefined);

    await assert.rejects(
      () =>
        companyUserService.deactivate(
          "company-1",
          "super-1",
          "super-1",
          true,
          "OWNER",
        ),
      (error: unknown) => error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED",
    );
  });
});
