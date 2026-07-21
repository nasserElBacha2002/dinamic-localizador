import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { serviceRepository } from "../repositories/service.repository";
import { platformCompanyService } from "./platform-company.service";
import { serviceService } from "./service.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  const pool = getPool();
  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM operational_locations WHERE company_id = @companyId;
    DELETE FROM employee_absence_balances WHERE company_id = @companyId;
    DELETE FROM employees WHERE company_id = @companyId;
    DELETE FROM employee_categories WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;
    DELETE FROM company_settings WHERE company_id = @companyId;
    DELETE FROM companies WHERE id = @companyId;
  `);
};

const createFixtureCompany = async (
  label: string,
): Promise<{ companyId: string; ownerEmail: string }> => {
  const suffix = uniqueSuffix();
  const ownerEmail = `svc-name-${label}-${suffix}@integration.test`;
  const result = await platformCompanyService.createCompany({
    name: `Svc Name Uniq ${label} ${suffix}`,
    defaultTimezone: "America/Argentina/Buenos_Aires",
    owner: {
      name: `Owner ${label}`,
      email: ownerEmail,
      temporaryPassword: "password123",
    },
  });
  return { companyId: result.data.company.id, ownerEmail };
};

const insertLocationDirect = async (
  companyId: string,
  name: string,
  latitude: number,
  longitude: number,
): Promise<string> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("name", sql.NVarChar(150), name)
    .input("latitude", sql.Decimal(10, 7), latitude)
    .input("longitude", sql.Decimal(10, 7), longitude)
    .input("allowedRadiusMeters", sql.Int, 150)
    .query(`
      INSERT INTO operational_locations (
        company_id, name, latitude, longitude, allowed_radius_meters
      )
      OUTPUT INSERTED.id
      VALUES (@companyId, @name, @latitude, @longitude, @allowedRadiusMeters)
    `);
  return String(result.recordset[0].id);
};

describeDatabaseIntegration("operational location name uniqueness per company", () => {
  const createdCompanyIds: string[] = [];
  const createdUserEmails: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await deleteCompanyCascade(companyId);
    }

    for (const email of createdUserEmails) {
      await pool.request().input("email", sql.NVarChar(255), email).query(`
        DECLARE @userId UNIQUEIDENTIFIER =
          (SELECT TOP 1 id FROM users WHERE email = @email);
        IF @userId IS NOT NULL
        BEGIN
          DELETE FROM user_company_memberships WHERE user_id = @userId;
          DELETE FROM users WHERE id = @userId;
        END
      `);
    }

    await teardownDatabaseIntegration();
  });

  it("enforces company-scoped uniqueness across service layer, repository, and database", async () => {
    const companyA = await createFixtureCompany("a");
    const companyB = await createFixtureCompany("b");
    createdCompanyIds.push(companyA.companyId, companyB.companyId);
    createdUserEmails.push(companyA.ownerEmail, companyB.ownerEmail);

    const sharedName = `Central-${uniqueSuffix()}`;

    try {
      const createdA = await serviceService.create(companyA.companyId, {
        name: sharedName,
        latitude: -34.6,
        longitude: -58.38,
        allowedRadiusMeters: 150,
      });
      assert.equal(createdA.name, sharedName);

      await assert.rejects(
        () =>
          serviceService.create(companyA.companyId, {
            name: ` ${sharedName} `,
            latitude: -34.61,
            longitude: -58.39,
            allowedRadiusMeters: 150,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.statusCode === 409 &&
          error.code === "SERVICE_NAME_ALREADY_EXISTS" &&
          error.message === "Ya existe un servicio con este nombre en la compañía.",
      );

      const createdB = await serviceService.create(companyB.companyId, {
        name: sharedName,
        latitude: -34.62,
        longitude: -58.4,
        allowedRadiusMeters: 150,
      });
      assert.equal(createdB.name, sharedName);

      const foundA = await serviceRepository.findByCompanyAndName(companyA.companyId, sharedName);
      const foundB = await serviceRepository.findByCompanyAndName(companyB.companyId, sharedName);
      assert.ok(foundA);
      assert.ok(foundB);
      assert.equal(foundA.id, createdA.id);
      assert.equal(foundB.id, createdB.id);
      assert.notEqual(foundA.id, foundB.id);

      const excludedSelf = await serviceRepository.findByCompanyAndNameExcludingId(
        companyA.companyId,
        sharedName,
        createdA.id,
      );
      assert.equal(excludedSelf, null);

      const secondary = await serviceService.create(companyA.companyId, {
        name: `Secondary-${uniqueSuffix()}`,
        latitude: -34.63,
        longitude: -58.41,
        allowedRadiusMeters: 150,
      });

      const duplicateSibling = await serviceRepository.findByCompanyAndNameExcludingId(
        companyA.companyId,
        sharedName,
        secondary.id,
      );
      assert.ok(duplicateSibling);
      assert.equal(duplicateSibling.id, createdA.id);

      const crossCompanyExcluded = await serviceRepository.findByCompanyAndNameExcludingId(
        companyA.companyId,
        sharedName,
        createdA.id,
      );
      assert.equal(crossCompanyExcluded, null);

      const kept = await serviceService.update(companyA.companyId, createdA.id, {
        name: sharedName,
        address: "Same name kept",
      });
      assert.equal(kept.name, sharedName);

      await assert.rejects(
        () =>
          serviceService.update(companyA.companyId, secondary.id, {
            name: sharedName,
          }),
        (error: unknown) =>
          error instanceof AppError &&
          error.statusCode === 409 &&
          error.code === "SERVICE_NAME_ALREADY_EXISTS",
      );

      await assert.rejects(
        () => insertLocationDirect(companyA.companyId, sharedName, -34.64, -58.42),
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return message.includes("UQ_operational_locations_company_id_name");
        },
      );

      const crossCompanyDirectId = await insertLocationDirect(
        companyB.companyId,
        `Cross-${uniqueSuffix()}`,
        -34.65,
        -58.43,
      );
      assert.ok(crossCompanyDirectId);

      const sameNameOtherCompany = await insertLocationDirect(
        companyB.companyId,
        `Other-${uniqueSuffix()}`,
        -34.66,
        -58.44,
      );
      assert.ok(sameNameOtherCompany);

      // Direct DB proof: same name across companies is accepted.
      const companyBSecondCentral = await insertLocationDirect(
        companyB.companyId,
        `Central-B-${uniqueSuffix()}`,
        -34.67,
        -58.45,
      );
      assert.ok(companyBSecondCentral);

      const companyACentralAgainName = `Shared-DB-${uniqueSuffix()}`;
      await insertLocationDirect(companyA.companyId, companyACentralAgainName, -34.68, -58.46);
      await insertLocationDirect(companyB.companyId, companyACentralAgainName, -34.69, -58.47);
    } finally {
      // Cleanup is also covered by after(); this keeps the suite resilient mid-run.
      await deleteCompanyCascade(companyA.companyId);
      await deleteCompanyCascade(companyB.companyId);
      const indexA = createdCompanyIds.indexOf(companyA.companyId);
      if (indexA >= 0) {
        createdCompanyIds.splice(indexA, 1);
      }
      const indexB = createdCompanyIds.indexOf(companyB.companyId);
      if (indexB >= 0) {
        createdCompanyIds.splice(indexB, 1);
      }
    }
  });
});
