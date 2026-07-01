import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { roleHasPermission } from "../constants/company-permissions";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

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

  it("returns 409 for duplicate active membership", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => ({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findById", async () => ({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "findMembership", async () => ({
      id: "membership-1",
      userId: "user-1",
      companyId: "company-1",
      role: "ADMIN",
      status: "ACTIVE",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await assert.rejects(
      () =>
        companyUserService.create(
          "company-1",
          { name: "User", email: "user@example.com", role: "ADMIN" },
          false,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "MEMBERSHIP_ALREADY_EXISTS",
    );
  });

  it("reactivates inactive membership for existing user", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => ({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findById", async () => ({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "findMembership", async () => ({
      id: "membership-1",
      userId: "user-1",
      companyId: "company-1",
      role: "READ_ONLY",
      status: "INACTIVE",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "updateMembership", async () => ({
      id: "membership-1",
      userId: "user-1",
      companyId: "company-1",
      role: "ADMIN",
      status: "ACTIVE",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "findCompanyUserRow", async () => ({
      user_id: "user-1",
      name: "User",
      email: "user@example.com",
      global_role: "ADMIN",
      is_platform_admin: 0,
      membership_id: "membership-1",
      company_id: "company-1",
      company_role: "ADMIN",
      membership_status: "ACTIVE",
      is_default: 0,
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null,
    }));

    const result = await companyUserService.create(
      "company-1",
      { name: "User", email: "user@example.com", role: "ADMIN" },
      false,
    );
    assert.equal(result.data.membershipStatus, "ACTIVE");
    assert.equal("temporaryPassword" in result, false);
    assert.equal("passwordHash" in result.data, false);
  });

  it("blocks demoting the last active OWNER", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
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
    mock.method(userCompanyMembershipRepository, "findMembership", async () => ({
      id: "membership-1",
      userId: "owner-1",
      companyId: "company-1",
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "countActiveOwners", async () => 1);

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "owner-1",
          { role: "ADMIN" },
          "requester-1",
          false,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "LAST_OWNER_PROTECTED",
    );
  });

  it("blocks regular user from modifying platform superadmin", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
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
    mock.method(userCompanyMembershipRepository, "findMembership", async () => ({
      id: "membership-1",
      userId: "platform-1",
      companyId: "company-1",
      role: "OWNER",
      status: "ACTIVE",
      isDefault: false,
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

  it("blocks regular user self-demote", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findById", async () => ({
      id: "user-1",
      name: "User",
      email: "user@example.com",
      passwordHash: "hash",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "findMembership", async () => ({
      id: "membership-1",
      userId: "user-1",
      companyId: "company-1",
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "countActiveOwners", async () => 2);

    await assert.rejects(
      () =>
        companyUserService.update(
          "company-1",
          "user-1",
          { role: "READ_ONLY" },
          "user-1",
          false,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "SELF_MEMBERSHIP_CHANGE_NOT_ALLOWED",
    );
  });

  it("create response does not include temporaryPassword or passwordHash", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");

    mock.method(companyRepository, "findById", async () => ({
      id: "company-1",
      name: "Co",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userRepository, "findByEmail", async () => null);
    mock.method(userRepository, "create", async () => ({
      id: "user-new",
      name: "New User",
      email: "new@example.com",
      passwordHash: "hashed-secret",
      role: "ADMIN",
      isPlatformAdmin: false,
      active: true,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "create", async () => ({
      id: "membership-1",
      userId: "user-new",
      companyId: "company-1",
      role: "ADMIN",
      status: "ACTIVE",
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(userCompanyMembershipRepository, "findCompanyUserRow", async () => ({
      user_id: "user-new",
      name: "New User",
      email: "new@example.com",
      global_role: "ADMIN",
      is_platform_admin: 0,
      membership_id: "membership-1",
      company_id: "company-1",
      company_role: "ADMIN",
      membership_status: "ACTIVE",
      is_default: 0,
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null,
    }));

    const result = await companyUserService.create(
      "company-1",
      {
        name: "New User",
        email: "new@example.com",
        role: "ADMIN",
        temporaryPassword: "password123",
      },
      false,
    );

    assert.equal("temporaryPassword" in result, false);
    assert.equal("passwordHash" in result.data, false);
    assert.equal(JSON.stringify(result).includes("password123"), false);
  });
});
