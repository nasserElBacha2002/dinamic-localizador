import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { clientsImportStrategy } from "./strategies/clients.strategy";
import { employeesImportStrategy } from "./strategies/employees.strategy";
import { employeeService } from "../services/employee.service";
import { normalizeClientName } from "../utils/client-name.utils";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("import clients integration", () => {
  const fixtures = createIntegrationFixtureTracker();
  const clientIdsToCleanup: string[] = [];
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
    const pool = getPool();
    for (const clientId of [...clientIdsToCleanup].reverse()) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("clientId", sql.UniqueIdentifier, clientId)
        .query(`
          DELETE FROM employee_clients
          WHERE company_id = @companyId AND client_id = @clientId;
          DELETE FROM clients WHERE id = @clientId AND company_id = @companyId;
        `);
    }
    clientIdsToCleanup.length = 0;
    await teardownDatabaseIntegration();
  });

  it("persists a client via import prepare/persist", async () => {
    const name = `Import Client ${Date.now()}`;
    const csv = ["Nombre", name].join("\n");
    const prepared = await clientsImportStrategy.prepare(companyId, Buffer.from(csv, "utf8"), "clients.csv");
    assert.equal(prepared.summary.validRows, 1);

    const executed = await clientsImportStrategy.persist(companyId, prepared, {
      revalidateConcurrency: true,
    });
    assert.equal(executed.summary.created, 1);

    const row = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(255), normalizeClientName(name))
      .query(`
        SELECT id FROM clients
        WHERE company_id = @companyId AND normalized_name = @normalizedName
      `);
    const clientId = String(row.recordset[0]?.id ?? "");
    assert.ok(clientId);
    clientIdsToCleanup.push(clientId);
  });

  it("creates employee_clients when importing employee with client", async () => {
    const clientName = `Import Emp Client ${Date.now()}`;
    const clientCsv = ["Nombre", clientName].join("\n");
    const clientPrepared = await clientsImportStrategy.prepare(
      companyId,
      Buffer.from(clientCsv, "utf8"),
      "clients.csv",
    );
    const clientExecuted = await clientsImportStrategy.persist(companyId, clientPrepared, {
      revalidateConcurrency: true,
    });
    assert.equal(clientExecuted.summary.created, 1);

    const clientRow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(255), normalizeClientName(clientName))
      .query(`SELECT id FROM clients WHERE company_id = @companyId AND normalized_name = @normalizedName`);
    const clientId = String(clientRow.recordset[0]?.id ?? "");
    clientIdsToCleanup.push(clientId);
    const phone = uniquePhone(3);
    const employeeCsv = [
      "Nombre,Documento,Teléfono,Tipo,Categoría,Cliente",
      `Emp Client Link,,${phone},Fijo,,${clientName}`,
    ].join("\n");
    const prepared = await employeesImportStrategy.prepare(
      companyId,
      Buffer.from(employeeCsv, "utf8"),
      "employees.csv",
    );
    assert.equal(prepared.summary.validRows, 1);

    const executed = await employeesImportStrategy.persist(companyId, prepared, {
      revalidateConcurrency: true,
    });
    assert.equal(executed.summary.created, 1);

    const employeeRow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`SELECT id FROM employees WHERE company_id = @companyId AND phone_number = @phone`);
    const employeeId = String(employeeRow.recordset[0]?.id ?? "");
    fixtures.trackEmployee(companyId, employeeId);

    const linkRow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .query(`
        SELECT 1 AS ok FROM employee_clients
        WHERE company_id = @companyId AND employee_id = @employeeId AND client_id = @clientId
      `);
    assert.equal(linkRow.recordset.length, 1);
  });

  it("rejects employee import when client was deactivated after preview", async () => {
    const clientName = `Inactive Client ${Date.now()}`;
    const clientCsv = ["Nombre", clientName].join("\n");
    const clientPrepared = await clientsImportStrategy.prepare(
      companyId,
      Buffer.from(clientCsv, "utf8"),
      "clients.csv",
    );
    await clientsImportStrategy.persist(companyId, clientPrepared, { revalidateConcurrency: true });

    const clientRow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(255), normalizeClientName(clientName))
      .query(`SELECT id FROM clients WHERE company_id = @companyId AND normalized_name = @normalizedName`);
    const clientId = String(clientRow.recordset[0]?.id ?? "");
    clientIdsToCleanup.push(clientId);
    const phone = uniquePhone(4);
    const employeeCsv = [
      "Nombre,Documento,Teléfono,Tipo,Categoría,Cliente",
      `Emp Inactive Client,,${phone},Fijo,,${clientName}`,
    ].join("\n");
    const prepared = await employeesImportStrategy.prepare(
      companyId,
      Buffer.from(employeeCsv, "utf8"),
      "employees.csv",
    );
    assert.equal(prepared.summary.validRows, 1);

    await getPool()
      .request()
      .input("clientId", sql.UniqueIdentifier, clientId)
      .query(`UPDATE clients SET is_active = 0 WHERE id = @clientId`);

    const executed = await employeesImportStrategy.persist(companyId, prepared, {
      revalidateConcurrency: true,
    });
    assert.equal(executed.summary.created, 0);
    assert.equal(executed.summary.rejected, 1);
    assert.equal(executed.rows[0]?.errors[0]?.code, "CLIENT_INACTIVE");

    const employeeRow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`SELECT id FROM employees WHERE company_id = @companyId AND phone_number = @phone`);
    assert.equal(employeeRow.recordset.length, 0);
  });

  it("rolls back employee create when client association is invalid", async () => {
    const phone = uniquePhone(5);
    const missingClientId = randomUUID();

    await assert.rejects(
      () =>
        employeeService.createManyForImport(companyId, [
          {
            name: `Rollback Emp ${Date.now()}`,
            phoneNumber: phone,
            employeeType: "fijo",
            clientIds: [missingClientId],
          },
        ]),
      (error: unknown) => error instanceof Error,
    );

    const employeeRow = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`SELECT id FROM employees WHERE company_id = @companyId AND phone_number = @phone`);
    assert.equal(employeeRow.recordset.length, 0);
  });

  it("allows import_jobs.entity_type clients per CK constraint", async () => {
    const pool = getPool();
    const check = await pool.request().query(`
      SELECT definition
      FROM sys.check_constraints
      WHERE name = N'CK_import_jobs_entity_type'
        AND parent_object_id = OBJECT_ID(N'dbo.import_jobs')
    `);
    const definition = String(check.recordset[0]?.definition ?? "");
    assert.match(definition, /clients/i);
  });
});
