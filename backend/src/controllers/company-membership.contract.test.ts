import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { resolvePermissionsForRole } from "../constants/company-permissions";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { companyRepository } from "../repositories/companies/company.repository";
import { userCompanyMembershipRepository } from "../repositories/companies/user-company-membership.repository";
import { userRepository } from "../repositories/identity/user.repository";
import { hashPassword } from "../utils/password";

const TEST_OWNER_EMAIL = "integration-me-owner@test.local";
const TEST_READ_ONLY_EMAIL = "integration-me-readonly@test.local";
const TEST_OUTSIDER_EMAIL = "integration-me-outsider@test.local";

describe("GET /api/companies/:companyId/me contract", () => {
  it("OWNER effective permissions include users:manage", () => {
    const permissions = resolvePermissionsForRole("OWNER");
    assert.equal(permissions.has("users:manage"), true);
  });

  it("READ_ONLY effective permissions exclude users:manage", () => {
    const permissions = resolvePermissionsForRole("READ_ONLY");
    assert.equal(permissions.has("users:manage"), false);
  });
});
