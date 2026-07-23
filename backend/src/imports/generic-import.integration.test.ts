import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { servicesImportStrategy } from "../imports/strategies/services.strategy";
import { employeesImportStrategy } from "../imports/strategies/employees.strategy";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("generic entity imports integration", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("imports a valid service via prepare/persist once and rejects duplicate on reimport", async () => {
    const name = `Import Svc ${Date.now()}`;
    const csv = [
      "Nombre,Dirección,Barrio,Localidad,Formato,Latitud,Longitud,Radio (metros),Google Place ID",
      `${name},Calle 1,Centro,CABA,,-34.6,-58.4,150,`,
    ].join("\n");
    const buffer = Buffer.from(csv, "utf8");

    const prepared = await servicesImportStrategy.prepare(companyId, buffer, "services.csv");
    assert.equal(prepared.summary.validRows, 1);
    assert.equal(prepared.summary.canConfirm, true);

    const executed = await servicesImportStrategy.persist(companyId, prepared, {
      revalidateConcurrency: true,
    });
    assert.equal(executed.summary.created, 1);
    assert.equal(executed.summary.rejected, 0);

    const serviceResult = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), name)
      .query(`SELECT id FROM operational_locations WHERE company_id = @companyId AND name = @name`);
    const serviceId = String(serviceResult.recordset[0].id);

    const rePrepared = await servicesImportStrategy.prepare(companyId, buffer, "services.csv");
    const reimport = await servicesImportStrategy.persist(companyId, rePrepared, {
      revalidateConcurrency: true,
    });
    assert.equal(reimport.summary.created, 0);
    assert.equal(reimport.summary.rejected, 1);
    assert.equal(reimport.rows[0]?.errors[0]?.code, "SERVICE_NAME_ALREADY_EXISTS");
    assert.equal(reimport.rows[0]?.errors[0]?.field, "name");

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, serviceId)
      .query(`DELETE FROM operational_locations WHERE id = @id`);
  });

  it("imports a valid employee via prepare/persist and rejects duplicate phone", async () => {
    const phone = uniquePhone(7);
    const csv = [
      "Nombre,Documento,Teléfono,Tipo,Categoría",
      `Import Emp ${Date.now()},,${phone},Fijo,`,
    ].join("\n");
    const buffer = Buffer.from(csv, "utf8");

    const prepared = await employeesImportStrategy.prepare(companyId, buffer, "employees.csv");
    assert.equal(prepared.summary.validRows, 1);

    const executed = await employeesImportStrategy.persist(companyId, prepared, {
      revalidateConcurrency: true,
    });
    assert.equal(executed.summary.created, 1);

    const employeeResult = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`SELECT id FROM employees WHERE company_id = @companyId AND phone_number = @phone`);
    const employeeId = String(employeeResult.recordset[0].id);

    const rePrepared = await employeesImportStrategy.prepare(companyId, buffer, "employees.csv");
    const reimport = await employeesImportStrategy.persist(companyId, rePrepared, {
      revalidateConcurrency: true,
    });
    assert.equal(reimport.summary.created, 0);
    assert.equal(reimport.summary.rejected, 1);
    assert.equal(reimport.rows[0]?.errors[0]?.code, "EMPLOYEE_PHONE_ALREADY_EXISTS");
    assert.equal(reimport.rows[0]?.errors[0]?.field, "phoneNumber");

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, employeeId)
      .query(`
        DELETE FROM employee_absence_balances WHERE employee_id = @id;
        DELETE FROM employees WHERE id = @id;
      `);
  });
});
