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
import { SERVICE_FORMAT_MAX_LENGTH } from "../utils/normalize-optional-text";
import { platformCompanyService } from "../services/platform-company.service";
import { serviceService } from "../services/service.service";
import { serviceRepository } from "../repositories/service.repository";
import { userRepository } from "../repositories/user.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { hashPassword } from "../utils/password";
import { companyLocationTypesRepository } from "../repositories/company-location-types.repository";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  const pool = getPool();
  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM operational_locations WHERE company_id = @companyId;
    DELETE FROM employee_absence_balances WHERE company_id = @companyId;
    DELETE FROM employees WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;
    DELETE FROM company_settings WHERE company_id = @companyId;
    DELETE FROM companies WHERE id = @companyId;
  `);
};

describeDatabaseIntegration("services list filters, facets, and sorting", () => {
  const createdCompanyIds: string[] = [];
  const createdUserIds: string[] = [];
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let companyAId = "";
  let companyBId = "";
  let ownerUserId = "";
  let ownerEmail = "";
  let noPermUserId = "";
  let noPermEmail = "";
  let formatCode = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    const companyA = await platformCompanyService.createCompany({
      name: `Svc List A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner A",
        email: `svc-list-owner-${suffix}@integration.test`,
        temporaryPassword: "password123",
      },
    });
    const companyB = await platformCompanyService.createCompany({
      name: `Svc List B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner B",
        email: `svc-list-owner-b-${suffix}@integration.test`,
        temporaryPassword: "password123",
      },
    });

    companyAId = companyA.data.company.id;
    companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    const owner = await userRepository.findByEmail(companyA.data.owner.email);
    assert.ok(owner);
    ownerUserId = owner.id;
    ownerEmail = owner.email;

    const passwordHash = await hashPassword("integration-test-password");
    const noPerm = await userRepository.create({
      name: "No Services Perm",
      email: `svc-list-noperm-${suffix}@integration.test`,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(noPerm.id);
    noPermUserId = noPerm.id;
    noPermEmail = noPerm.email;
    await userCompanyMembershipRepository.create({
      userId: noPerm.id,
      companyId: companyAId,
      role: "OPERATOR",
      status: "ACTIVE",
    });

    formatCode = `FMT${suffix}`.slice(0, 20);
    await companyLocationTypesRepository.create(companyAId, {
      code: formatCode,
      name: "Formato Test",
      sortOrder: 1,
      isActive: true,
    });

    await serviceService.create(companyAId, {
      name: `Alpha ${suffix}`,
      locality: "  CABA  ",
      neighborhood: " Palermo ",
      address: "  Calle 1 ",
      serviceFormat: formatCode,
      latitude: -34.6,
      longitude: -58.4,
      allowedRadiusMeters: 150,
    });
    await serviceService.create(companyAId, {
      name: `Beta ${suffix}`,
      locality: "CABA",
      neighborhood: "Belgrano",
      serviceFormat: formatCode,
      latitude: -34.55,
      longitude: -58.45,
      allowedRadiusMeters: 150,
    });
    await serviceService.create(companyAId, {
      name: `Gamma ${suffix}`,
      locality: "GBA",
      neighborhood: "Lanus",
      latitude: -34.7,
      longitude: -58.5,
      allowedRadiusMeters: 150,
    });
    const inactive = await serviceService.create(companyAId, {
      name: `Delta ${suffix}`,
      locality: "CABA",
      neighborhood: "Recoleta",
      latitude: -34.58,
      longitude: -58.39,
      allowedRadiusMeters: 150,
    });
    await serviceService.deactivate(companyAId, inactive.id);

    await serviceService.create(companyBId, {
      name: `OtherCo ${suffix}`,
      locality: "CABA",
      neighborhood: "Palermo",
      latitude: -34.6,
      longitude: -58.4,
      allowedRadiusMeters: 150,
    });

    // Historical padded values (pre-normalization path): insert raw then list facets/filters after trim migration semantics via service update path covered above.
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("name", sql.NVarChar(150), `Padded ${suffix}`)
      .input("locality", sql.NVarChar(150), "  Mendoza  ")
      .input("neighborhood", sql.NVarChar(150), "  Centro  ")
      .input("latitude", sql.Decimal(10, 7), -32.9)
      .input("longitude", sql.Decimal(10, 7), -68.8)
      .input("allowedRadiusMeters", sql.Int, 150)
      .query(`
        INSERT INTO operational_locations (
          company_id, name, locality, neighborhood, latitude, longitude, allowed_radius_meters
        )
        VALUES (
          @companyId, @name, @locality, @neighborhood, @latitude, @longitude, @allowedRadiusMeters
        )
      `);
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await deleteCompanyCascade(companyId);
    }
    for (const userId of createdUserIds) {
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
    signTestToken({
      userId: ownerUserId,
      email: ownerEmail,
      role: "ADMIN",
    });

  const noPermToken = () =>
    signTestToken({
      userId: noPermUserId,
      email: noPermEmail,
      role: "ADMIN",
    });

  const companyPath = (companyId: string, suffix: string) =>
    `/api/companies/${companyId}${suffix}`;

  it("normalizes optional text on create", async () => {
    const listed = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 50,
      locality: "CABA",
      neighborhood: "Palermo",
      sortDirection: "asc",
    });
    assert.ok(listed.items.some((item) => item.neighborhood === "Palermo"));
    assert.ok(listed.items.every((item) => item.locality === "CABA"));
    assert.ok(listed.items.every((item) => item.address === null || !/^\s|\s$/.test(item.address)));
  });

  it("filters individually and in combination with consistent count", async () => {
    const byLocality = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 10,
      locality: "CABA",
      sortDirection: "asc",
    });
    assert.ok(byLocality.total >= 3);
    assert.equal(byLocality.items.length, Math.min(10, byLocality.total));

    const combined = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 10,
      locality: "CABA",
      neighborhood: "Belgrano",
      serviceFormat: formatCode,
      active: true,
      sortDirection: "asc",
    });
    assert.equal(combined.total, combined.items.length);
    assert.ok(combined.items.every((item) => item.neighborhood === "Belgrano"));
  });

  it("paginates with stable tie-break and sorts asc/desc", async () => {
    const asc = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 2,
      sortBy: "name",
      sortDirection: "asc",
    });
    const desc = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 2,
      sortBy: "name",
      sortDirection: "desc",
    });
    assert.equal(asc.items.length, 2);
    assert.equal(desc.items.length, 2);
    assert.notEqual(asc.items[0]?.name, desc.items[0]?.name);

    const page2 = await serviceRepository.list(companyAId, {
      page: 2,
      limit: 2,
      sortBy: "name",
      sortDirection: "asc",
    });
    assert.ok(page2.items.every((item) => !asc.items.some((first) => first.id === item.id)));
  });

  it("returns company-global facets including inactive and excludes empty", async () => {
    const facets = await serviceRepository.listGeoFacets(companyAId);
    assert.ok(facets.localities.includes("CABA"));
    assert.ok(facets.localities.includes("GBA"));
    assert.ok(facets.neighborhoodsByLocality.CABA?.includes("Recoleta"));
    assert.ok(!facets.localities.includes(""));
    assert.deepEqual([...facets.localities], [...facets.localities].sort((a, b) => a.localeCompare(b)));

    const other = await serviceRepository.listGeoFacets(companyBId);
    assert.ok(other.localities.includes("CABA"));
    assert.ok(!other.neighborhoodsByLocality.CABA?.includes("Belgrano"));
  });

  it("isolates list and facets between companies", async () => {
    const listedA = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 100,
      sortDirection: "asc",
    });
    const listedB = await serviceRepository.list(companyBId, {
      page: 1,
      limit: 100,
      sortDirection: "asc",
    });
    assert.ok(listedA.items.every((item) => !listedB.items.some((other) => other.id === item.id)));
  });

  it("serves HTTP list/facets with services:read and denies without permission", async () => {
    const listOk = await apiRequest(
      baseUrl,
      companyPath(companyAId, `/services?locality=CABA&sortBy=name&sortDirection=asc`),
      { token: ownerToken() },
    );
    assert.equal(listOk.status, 200);
    const listBody = listOk.body as { data: unknown[]; meta: { total: number } };
    assert.ok(Array.isArray(listBody.data));
    assert.ok(listBody.meta.total >= 1);

    const facetsOk = await apiRequest(baseUrl, companyPath(companyAId, "/services/facets"), {
      token: ownerToken(),
    });
    assert.equal(facetsOk.status, 200);
    const facetsBody = facetsOk.body as {
      data: { localities: string[]; neighborhoodsByLocality: Record<string, string[]> };
    };
    assert.ok(facetsBody.data.localities.includes("CABA"));

    const deniedList = await apiRequest(baseUrl, companyPath(companyAId, "/services"), {
      token: noPermToken(),
    });
    assert.equal(deniedList.status, 403);

    const deniedFacets = await apiRequest(baseUrl, companyPath(companyAId, "/services/facets"), {
      token: noPermToken(),
    });
    assert.equal(deniedFacets.status, 403);
  });

  it("rejects unknown sort and injection attempts via HTTP", async () => {
    const unknownSort = await apiRequest(
      baseUrl,
      companyPath(companyAId, "/services?sortBy=latitude"),
      { token: ownerToken() },
    );
    assert.equal(unknownSort.status, 400);

    const injection = await apiRequest(
      baseUrl,
      companyPath(
        companyAId,
        `/services?sortBy=${encodeURIComponent("name;DROP TABLE operational_locations--")}`,
      ),
      { token: ownerToken() },
    );
    assert.equal(injection.status, 400);
  });

  it("accepts max-length serviceFormat filter and rejects overflow", async () => {
    const max = "Z".repeat(SERVICE_FORMAT_MAX_LENGTH);
    const ok = await apiRequest(
      baseUrl,
      companyPath(companyAId, `/services?serviceFormat=${encodeURIComponent(max)}`),
      { token: ownerToken() },
    );
    assert.equal(ok.status, 200);

    const overflow = await apiRequest(
      baseUrl,
      companyPath(companyAId, `/services?serviceFormat=${encodeURIComponent(`${max}X`)}`),
      { token: ownerToken() },
    );
    assert.equal(overflow.status, 400);
  });

  it("returns empty list for company without matching filters", async () => {
    const emptyCompany = await platformCompanyService.createCompany({
      name: `Svc Empty ${uniqueSuffix()}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Empty Owner",
        email: `svc-empty-${uniqueSuffix()}@integration.test`,
        temporaryPassword: "password123",
      },
    });
    createdCompanyIds.push(emptyCompany.data.company.id);

    const facets = await serviceRepository.listGeoFacets(emptyCompany.data.company.id);
    assert.deepEqual(facets.localities, []);
    assert.deepEqual(facets.neighborhoodsByLocality, {});

    const listed = await serviceRepository.list(emptyCompany.data.company.id, {
      page: 1,
      limit: 10,
      sortDirection: "asc",
    });
    assert.equal(listed.total, 0);
    assert.deepEqual(listed.items, []);
  });

  it("can filter padded historical locality only after explicit normalization", async () => {
    const pool = getPool();
    await pool.request().input("companyId", sql.UniqueIdentifier, companyAId).query(`
      UPDATE operational_locations
      SET
        locality = CASE
          WHEN locality IS NULL THEN NULL
          WHEN LTRIM(RTRIM(locality)) = N'' THEN NULL
          ELSE LTRIM(RTRIM(locality))
        END,
        neighborhood = CASE
          WHEN neighborhood IS NULL THEN NULL
          WHEN LTRIM(RTRIM(neighborhood)) = N'' THEN NULL
          ELSE LTRIM(RTRIM(neighborhood))
        END
      WHERE company_id = @companyId
    `);

    const listed = await serviceRepository.list(companyAId, {
      page: 1,
      limit: 20,
      locality: "Mendoza",
      sortDirection: "asc",
    });
    assert.ok(listed.total >= 1);
    assert.ok(listed.items.every((item) => item.locality === "Mendoza"));
  });
});
