import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { hashPassword } from "../utils/password";
import { userRepository } from "../repositories/user.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("company alert recipients HTTP API", () => {
  const createdCompanyIds: string[] = [];
  const createdUserIds: string[] = [];
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let companyAId = "";
  let companyBId = "";
  let ownerUserId = "";
  let ownerEmail = "";
  let readerUserId = "";
  let readerEmail = "";
  let ownerBUserId = "";
  let ownerBEmail = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    ownerEmail = `alert-http-owner-a-${suffix}@integration.test`;
    readerEmail = `alert-http-reader-a-${suffix}@integration.test`;
    ownerBEmail = `alert-http-owner-b-${suffix}@integration.test`;

    const companyA = await createPlatformCompanyFixture({
      name: `Alert HTTP A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: ownerEmail },
    });
    const companyB = await createPlatformCompanyFixture({
      name: `Alert HTTP B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: ownerBEmail },
    });
    companyAId = companyA.data.company.id;
    companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    const passwordHash = await hashPassword("integration-test-password");
    const owner = await userRepository.create({
      name: "Owner A Alerts",
      email: ownerEmail,
      passwordHash,
      role: "ADMIN",
    });
    const reader = await userRepository.create({
      name: "Reader A",
      email: readerEmail,
      passwordHash,
      role: "ADMIN",
    });
    const ownerB = await userRepository.create({
      name: "Owner B Alerts",
      email: ownerBEmail,
      passwordHash,
      role: "ADMIN",
    });
    ownerUserId = owner.id;
    readerUserId = reader.id;
    ownerBUserId = ownerB.id;
    createdUserIds.push(owner.id, reader.id, ownerB.id);

    await userCompanyMembershipRepository.create({
      userId: owner.id,
      companyId: companyAId,
      role: "OWNER",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: reader.id,
      companyId: companyAId,
      role: "OPERATOR",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: ownerB.id,
      companyId: companyBId,
      role: "OWNER",
      status: "ACTIVE",
    });
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds.splice(0)) {
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

  const ownerToken = () =>
    signTestToken({ userId: ownerUserId, email: ownerEmail, role: "ADMIN" });
  const readerToken = () =>
    signTestToken({ userId: readerUserId, email: readerEmail, role: "ADMIN" });
  const ownerBToken = () =>
    signTestToken({ userId: ownerBUserId, email: ownerBEmail, role: "ADMIN" });

  const pathFor = (companyId: string, suffix = "") =>
    `/api/companies/${companyId}/company-alert-recipients${suffix}`;

  it("company:settings:update can patch admin alerts; OPERATOR gets 403", async () => {
    const patch = await apiRequest(baseUrl, `/api/companies/${companyAId}/settings`, {
      method: "PATCH",
      token: ownerToken(),
      body: { adminAlertsEnabled: true },
    });
    assert.equal(patch.status, 200);
    const body = patch.body.data as { adminAlertsEnabled?: boolean; adminAlertsEnabledAt?: string | null };
    assert.equal(body.adminAlertsEnabled, true);
    assert.ok(body.adminAlertsEnabledAt);

    const forbidden = await apiRequest(baseUrl, `/api/companies/${companyAId}/settings`, {
      method: "PATCH",
      token: readerToken(),
      body: { adminAlertsEnabled: false },
    });
    assert.equal(forbidden.status, 403);
  });

  it("company:settings:update can list recipients; OPERATOR gets 403", async () => {
    const ok = await apiRequest(baseUrl, pathFor(companyAId), { token: ownerToken() });
    assert.equal(ok.status, 200);

    const forbidden = await apiRequest(baseUrl, pathFor(companyAId), { token: readerToken() });
    assert.equal(forbidden.status, 403);
  });

  it("blocks cross-company recipient mutation", async () => {
    const create = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: {
        phoneNumber: "+5491111111101",
        displayName: "A only",
        receiveRequestAlerts: true,
      },
    });
    assert.equal(create.status, 201);
    const recipientId = (create.body.data as { id: string }).id;

    const cross = await apiRequest(baseUrl, pathFor(companyBId, `/${recipientId}`), {
      method: "PATCH",
      token: ownerBToken(),
      body: { displayName: "Hijack" },
    });
    assert.ok(cross.status === 404 || cross.status === 403);
  });

  it("rejects cross-company userId; allows null userId", async () => {
    const foreignEmail = `alert-http-foreign-${uniqueSuffix()}@integration.test`;
    const foreignUser = await userRepository.create({
      name: "Foreign",
      email: foreignEmail,
      passwordHash: await hashPassword("integration-test-password"),
      role: "ADMIN",
    });
    createdUserIds.push(foreignUser.id);
    await userCompanyMembershipRepository.create({
      userId: foreignUser.id,
      companyId: companyBId,
      role: "ADMIN",
      status: "ACTIVE",
    });

    const bad = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: {
        phoneNumber: "+5491111111102",
        userId: foreignUser.id,
      },
    });
    assert.equal(bad.status, 400);

    const ok = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: {
        phoneNumber: "+5491111111103",
        userId: null,
        displayName: "No user",
      },
    });
    assert.equal(ok.status, 201);
  });

  it("duplicate phone same company 409; same phone other company allowed; invalid E.164 400", async () => {
    const first = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { phoneNumber: "+5491111111199", displayName: "Dup" },
    });
    assert.equal(first.status, 201);

    const dup = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { phoneNumber: "+5491111111199", displayName: "Dup2" },
    });
    assert.equal(dup.status, 409);

    const other = await apiRequest(baseUrl, pathFor(companyBId), {
      method: "POST",
      token: ownerBToken(),
      body: { phoneNumber: "+5491111111199", displayName: "Other co" },
    });
    assert.equal(other.status, 201);

    const invalid = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { phoneNumber: "not-a-phone" },
    });
    assert.equal(invalid.status, 400);
  });
});
