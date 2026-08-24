import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { userRepository } from "../repositories/user.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { hashPassword } from "../utils/password";
import { employeeService } from "./employee.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

describeDatabaseIntegration("employee operations HTTP API", () => {
  const createdCompanyIds: string[] = [];
  const createdUserIds: string[] = [];
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let companyAId = "";
  let companyBId = "";
  let ownerUserId = "";
  let ownerEmail = "";
  let hrUserId = "";
  let hrEmail = "";
  let supervisorUserId = "";
  let supervisorEmail = "";
  let employeeAId = "";
  let employeeBId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    const companyA = await createPlatformCompanyFixture({
      name: `Emp Ops HTTP A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `emp-ops-owner-a-${suffix}@integration.test` },
    });
    const companyB = await createPlatformCompanyFixture({
      name: `Emp Ops HTTP B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `emp-ops-owner-b-${suffix}@integration.test` },
    });
    companyAId = companyA.data.company.id;
    companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    const passwordHash = await hashPassword("integration-test-password");
    ownerEmail = `emp-ops-owner-${suffix}@integration.test`;
    hrEmail = `emp-ops-hr-${suffix}@integration.test`;
    supervisorEmail = `emp-ops-sup-${suffix}@integration.test`;

    const owner = await userRepository.create({
      name: "Owner",
      email: ownerEmail,
      passwordHash,
      role: "ADMIN",
    });
    const hr = await userRepository.create({
      name: "HR",
      email: hrEmail,
      passwordHash,
      role: "ADMIN",
    });
    const supervisor = await userRepository.create({
      name: "Supervisor",
      email: supervisorEmail,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(owner.id, hr.id, supervisor.id);
    ownerUserId = owner.id;
    hrUserId = hr.id;
    supervisorUserId = supervisor.id;

    await userCompanyMembershipRepository.create({
      userId: owner.id,
      companyId: companyAId,
      role: "OWNER",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: hr.id,
      companyId: companyAId,
      role: "HR",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: supervisor.id,
      companyId: companyAId,
      role: "SUPERVISOR",
      status: "ACTIVE",
    });

    const employeeA = await employeeService.create(companyAId, {
      name: "Employee A",
      phoneNumber: uniquePhone(11),
      employeeType: "fijo",
    });
    const employeeB = await employeeService.create(companyBId, {
      name: "Employee B",
      phoneNumber: uniquePhone(12),
      employeeType: "fijo",
    });
    employeeAId = employeeA.id;
    employeeBId = employeeB.id;
  });

  after(async () => {
    if (closeServer) {
      await closeServer();
    }
    for (const companyId of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(companyId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await getPool()
        .request()
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          DELETE FROM user_company_memberships WHERE user_id = @userId;
          DELETE FROM users WHERE id = @userId;
        `);
    }
    await teardownDatabaseIntegration();
  });

  const pathFor = (companyId: string, employeeId: string) =>
    `/api/companies/${companyId}/employees/${employeeId}/operations?segment=active`;

  const ownerToken = () =>
    signTestToken({ userId: ownerUserId, email: ownerEmail, role: "ADMIN" });
  const hrToken = () => signTestToken({ userId: hrUserId, email: hrEmail, role: "ADMIN" });
  const supervisorToken = () =>
    signTestToken({ userId: supervisorUserId, email: supervisorEmail, role: "ADMIN" });

  it("allows employees:read + operations:read (SUPERVISOR)", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId, employeeAId), {
      token: supervisorToken(),
    });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.data));
    assert.equal(typeof response.body.meta.total, "number");
  });

  it("allows employees:read + operations:manage (OWNER)", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId, employeeAId), {
      token: ownerToken(),
    });
    assert.equal(response.status, 200);
  });

  it("rejects employees:read without operations permission (HR)", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId, employeeAId), {
      token: hrToken(),
    });
    assert.equal(response.status, 403);
  });

  it("returns 404 for employee in another company", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId, employeeBId), {
      token: supervisorToken(),
    });
    assert.equal(response.status, 404);
  });

  it("returns 404 for missing employee", async () => {
    const response = await apiRequest(
      baseUrl,
      pathFor(companyAId, "11111111-1111-4111-8111-111111111111"),
      { token: supervisorToken() },
    );
    assert.equal(response.status, 404);
  });
});
