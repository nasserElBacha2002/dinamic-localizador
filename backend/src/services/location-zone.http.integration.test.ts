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
import { locationZoneService } from "./location-zone.service";
import { employeeService } from "./employee.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("location zones HTTP API + residence privacy", () => {
  const createdCompanyIds: string[] = [];
  const createdUserIds: string[] = [];
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let companyAId = "";
  let companyBId = "";
  let ownerUserId = "";
  let ownerEmail = "";
  let supervisorUserId = "";
  let supervisorEmail = "";
  let readOnlyUserId = "";
  let readOnlyEmail = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    const companyA = await createPlatformCompanyFixture({
      name: `Zone HTTP A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner A",
        email: `zone-http-owner-a-${suffix}@integration.test`,
      },
    });
    const companyB = await createPlatformCompanyFixture({
      name: `Zone HTTP B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner B",
        email: `zone-http-owner-b-${suffix}@integration.test`,
      },
    });
    companyAId = companyA.data.company.id;
    companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    const passwordHash = await hashPassword("integration-test-password");
    ownerEmail = `zone-http-owner-a-${suffix}@integration.test`;
    const owner = await userRepository.create({
      name: "Owner A",
      email: ownerEmail,
      passwordHash,
      role: "ADMIN",
    });
    const supervisor = await userRepository.create({
      name: "Supervisor Zone",
      email: `zone-http-sup-${suffix}@integration.test`,
      passwordHash,
      role: "ADMIN",
    });
    const readOnly = await userRepository.create({
      name: "ReadOnly Zone",
      email: `zone-http-ro-${suffix}@integration.test`,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(owner.id, supervisor.id, readOnly.id);
    ownerUserId = owner.id;
    supervisorUserId = supervisor.id;
    supervisorEmail = supervisor.email;
    readOnlyUserId = readOnly.id;
    readOnlyEmail = readOnly.email;

    await userCompanyMembershipRepository.create({
      userId: owner.id,
      companyId: companyAId,
      role: "OWNER",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: supervisor.id,
      companyId: companyAId,
      role: "SUPERVISOR",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: readOnly.id,
      companyId: companyAId,
      role: "READ_ONLY",
      status: "ACTIVE",
    });
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds.splice(0)) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        UPDATE employees SET location_zone_id = NULL WHERE company_id = @companyId;
        DELETE FROM company_location_zones WHERE company_id = @companyId;
      `);
      await deleteCompanyCascade(companyId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await pool.request().input("userId", sql.UniqueIdentifier, userId).query(`
        DELETE FROM user_company_memberships WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
    if (closeServer) {
      await closeServer();
    }
    await teardownDatabaseIntegration();
  });

  const pathFor = (companyId: string, suffix = "") =>
    `/api/companies/${companyId}/location-zones${suffix}`;

  const ownerToken = () =>
    signTestToken({ userId: ownerUserId, email: ownerEmail, role: "ADMIN" });
  const supervisorToken = () =>
    signTestToken({ userId: supervisorUserId, email: supervisorEmail, role: "ADMIN" });
  const readOnlyToken = () =>
    signTestToken({ userId: readOnlyUserId, email: readOnlyEmail, role: "ADMIN" });

  it("allows OWNER to CRUD zones and denies READ_ONLY/SUPERVISOR list", async () => {
    const suffix = uniqueSuffix();
    const createRes = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { name: `HTTP Caballito ${suffix}`, locality: "CABA" },
    });
    assert.equal(createRes.status, 201);
    const zoneId = (createRes.body.data as { id: string }).id;

    const listOwner = await apiRequest(baseUrl, pathFor(companyAId), { token: ownerToken() });
    assert.equal(listOwner.status, 200);
    assert.ok(
      ((listOwner.body.data as Array<{ id: string }>).some((row) => row.id === zoneId)),
    );

    const patchRes = await apiRequest(baseUrl, pathFor(companyAId, `/${zoneId}`), {
      method: "PATCH",
      token: ownerToken(),
      body: { isActive: false },
    });
    assert.equal(patchRes.status, 200);
    assert.equal((patchRes.body.data as { isActive: boolean }).isActive, true);
    assert.equal(
      (patchRes.body.data as { associationActive: boolean }).associationActive,
      false,
    );

    const listSup = await apiRequest(baseUrl, pathFor(companyAId), { token: supervisorToken() });
    assert.equal(listSup.status, 403);

    const listRo = await apiRequest(baseUrl, pathFor(companyAId), { token: readOnlyToken() });
    assert.equal(listRo.status, 403);

    const postRo = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: readOnlyToken(),
      body: { name: `HTTP Flores ${suffix}` },
    });
    assert.equal(postRo.status, 403);
  });

  it("isolates zones by tenant and redacts residence for SUPERVISOR employee reads", async () => {
    const zoneA = await locationZoneService.create(companyAId, "OWNER", {
      name: `HTTP Zone ${uniqueSuffix()}`,
    });
    await locationZoneService.create(companyBId, "OWNER", {
      name: `Foreign ${uniqueSuffix()}`,
    });

    const listA = await apiRequest(baseUrl, pathFor(companyAId), { token: ownerToken() });
    assert.equal(listA.status, 200);
    assert.equal(
      (listA.body.data as Array<{ id: string }>).some((zone) => zone.id === zoneA.id),
      true,
    );

    const employee = await employeeService.create(companyAId, {
      name: "Privacy Emp",
      phoneNumber: `+54911${String(Date.now()).slice(-8)}01`,
      employeeType: "fijo",
      locationZoneId: zoneA.id,
    });

    const ownerGet = await apiRequest(
      baseUrl,
      `/api/companies/${companyAId}/employees/${employee.id}`,
      { token: ownerToken() },
    );
    assert.equal(ownerGet.status, 200);
    assert.equal((ownerGet.body.data as { locationZoneId: string }).locationZoneId, zoneA.id);

    const supGet = await apiRequest(
      baseUrl,
      `/api/companies/${companyAId}/employees/${employee.id}`,
      { token: supervisorToken() },
    );
    assert.equal(supGet.status, 200);
    assert.equal((supGet.body.data as { locationZoneId: string | null }).locationZoneId, null);
    assert.equal((supGet.body.data as { locationZone: unknown }).locationZone, null);
  });

  it("returns geocoding coverage summary for active zones only", async () => {
    const suffix = uniqueSuffix();
    await locationZoneService.create(companyAId, "OWNER", {
      name: `Summary Resolved ${suffix}`,
      locality: "CABA",
      centroidLatitude: -34.61,
      centroidLongitude: -58.44,
    });

    await locationZoneService.create(companyAId, "OWNER", {
      name: `Summary Pending ${suffix}`,
      locality: "CABA",
    });

    const inactive = await locationZoneService.create(companyAId, "OWNER", {
      name: `Summary Inactive ${suffix}`,
      locality: "CABA",
      centroidLatitude: -34.5,
      centroidLongitude: -58.5,
    });
    await locationZoneService.update(companyAId, "OWNER", inactive.id, { isActive: false });

    const summaryRes = await apiRequest(baseUrl, pathFor(companyAId, "/geocoding-summary"), {
      token: ownerToken(),
    });
    assert.equal(summaryRes.status, 200);
    const summary = summaryRes.body.data as {
      total: number;
      withCoordinates: number;
      pending: number;
      coveragePercent: number;
      canonicalized: number;
      missingLocality: number;
      unknownLocality: number;
    };
    assert.ok(summary.total >= 2);
    assert.ok(summary.withCoordinates >= 1);
    assert.ok(summary.pending >= 1);
    assert.ok(summary.coveragePercent >= 0 && summary.coveragePercent <= 100);
    assert.ok(typeof summary.canonicalized === "number");
    assert.ok(typeof summary.missingLocality === "number");
    assert.ok(typeof summary.unknownLocality === "number");

    const denied = await apiRequest(baseUrl, pathFor(companyAId, "/geocoding-summary"), {
      token: supervisorToken(),
    });
    assert.equal(denied.status, 403);
  });
});
