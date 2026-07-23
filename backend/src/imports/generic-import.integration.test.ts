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

  it("imports a valid service and rejects duplicate on reimport", async () => {
    const name = `Import Svc ${Date.now()}`;
    const csv = [
      "Nombre,Dirección,Barrio,Localidad,Formato,Latitud,Longitud,Radio (metros),Google Place ID",
      `${name},Calle 1,Centro,CABA,,-34.6,-58.4,150,`,
    ].join("\n");

    const preview = await servicesImportStrategy.preview(
      companyId,
      Buffer.from(csv, "utf8"),
      "services.csv",
    );
    assert.equal(preview.summary.validRows, 1);
    assert.equal(preview.summary.canConfirm, true);

    const executed = await servicesImportStrategy.execute(
      companyId,
      Buffer.from(csv, "utf8"),
      "services.csv",
    );
    assert.equal(executed.summary.created, 1);
    assert.equal(executed.summary.rejected, 0);

    const serviceResult = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), name)
      .query(`SELECT id FROM operational_locations WHERE company_id = @companyId AND name = @name`);
    const serviceId = String(serviceResult.recordset[0].id);

    const reimport = await servicesImportStrategy.execute(
      companyId,
      Buffer.from(csv, "utf8"),
      "services.csv",
    );
    assert.equal(reimport.summary.created, 0);
    assert.equal(reimport.summary.rejected, 1);

    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, serviceId)
      .query(`DELETE FROM operational_locations WHERE id = @id`);
  });

  it("imports a valid employee and rejects duplicate phone", async () => {
    const phone = uniquePhone(7);
    const csv = [
      "Nombre,Documento,Teléfono,Tipo,Categoría",
      `Import Emp ${Date.now()},,${phone},Fijo,`,
    ].join("\n");

    const preview = await employeesImportStrategy.preview(
      companyId,
      Buffer.from(csv, "utf8"),
      "employees.csv",
    );
    assert.equal(preview.summary.validRows, 1);

    const executed = await employeesImportStrategy.execute(
      companyId,
      Buffer.from(csv, "utf8"),
      "employees.csv",
    );
    assert.equal(executed.summary.created, 1);

    const employeeId = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`SELECT id FROM employees WHERE company_id = @companyId AND phone_number = @phone`);
    fixtures.trackEmployee(companyId, String(employeeId.recordset[0].id));

    const reimport = await employeesImportStrategy.execute(
      companyId,
      Buffer.from(csv, "utf8"),
      "employees.csv",
    );
    assert.equal(reimport.summary.created, 0);
    assert.equal(reimport.summary.rejected, 1);
  });
});
