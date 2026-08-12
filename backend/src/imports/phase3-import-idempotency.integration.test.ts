/**
 * Phase 3 corrections — import job idempotency under concurrency.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { importOrchestrator } from "../imports/orchestrator";

describeDatabaseIntegration("phase3 import idempotency concurrency", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";

  before(async () => {
    await setupDatabaseIntegration();
    const company = await getPool().request().query(`
      SELECT TOP 1 id FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END, created_at ASC
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId);
  });

  after(async () => {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM import_jobs
        WHERE company_id = @companyId
          AND idempotency_key LIKE N'phase3-import-%'
      `);
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const csvFor = (name: string): string =>
    [
      "Nombre,Dirección,Barrio,Localidad,Formato,Latitud,Longitud,Radio (metros),Google Place ID",
      `${name},Calle 1,Centro,CABA,,-34.6,-58.4,150,`,
    ].join("\n");

  it("concurrent preview same key + same payload yields one job", async () => {
    const key = `phase3-import-same-${randomUUID()}`;
    const name = `Phase3 Idem ${Date.now()}`;
    const fileContentBase64 = Buffer.from(csvFor(name), "utf8").toString("base64");

    const [first, second] = await Promise.all([
      importOrchestrator.preview(
        companyId,
        "services",
        { fileName: "services.csv", fileContentBase64, idempotencyKey: key },
        null,
      ),
      importOrchestrator.preview(
        companyId,
        "services",
        { fileName: "services.csv", fileContentBase64, idempotencyKey: key },
        null,
      ),
    ]);

    assert.equal(first.importJobId, second.importJobId);
    assert.equal(first.fileHash, second.fileHash);

    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("key", sql.NVarChar(128), key)
      .query(`
        SELECT COUNT(*) AS c
        FROM import_jobs
        WHERE company_id = @companyId AND idempotency_key = @key
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("same key + different payload returns IDEMPOTENCY_KEY_CONFLICT", async () => {
    const key = `phase3-import-conflict-${randomUUID()}`;
    const firstCsv = csvFor(`Phase3 A ${Date.now()}`);
    const secondCsv = csvFor(`Phase3 B ${Date.now()}`);

    const first = await importOrchestrator.preview(
      companyId,
      "services",
      {
        fileName: "services-a.csv",
        fileContentBase64: Buffer.from(firstCsv, "utf8").toString("base64"),
        idempotencyKey: key,
      },
      null,
    );
    assert.ok(first.importJobId);

    await assert.rejects(
      () =>
        importOrchestrator.preview(
          companyId,
          "services",
          {
            fileName: "services-b.csv",
            fileContentBase64: Buffer.from(secondCsv, "utf8").toString("base64"),
            idempotencyKey: key,
          },
          null,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "IDEMPOTENCY_KEY_CONFLICT",
    );

    const count = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("key", sql.NVarChar(128), key)
      .query(`
        SELECT COUNT(*) AS c
        FROM import_jobs
        WHERE company_id = @companyId AND idempotency_key = @key
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });
});
