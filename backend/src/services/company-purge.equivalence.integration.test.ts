/**
 * Phase 5 corrections — company purge set-based equivalence (real SQL).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { getPool } from "../database/connection";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import {
  assertNoCompanyResidues,
  deleteCompanyIdentityAndConfigSetBased,
  deleteCompanyOperationalDataSetBased,
} from "../repositories/company-purge.repository";
import { pendingStorageDeletionRepository } from "../repositories/pending-storage-deletion.repository";

const uniqueName = (): string =>
  `Purge Eq ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("company purge set-based equivalence", () => {
  const companyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const id of [...companyIds].reverse()) {
      try {
        await deleteCompanyCascade(id);
      } catch {
        /* may already be purged */
      }
    }
    await teardownDatabaseIntegration();
  });

  it("operational delete removes ops rows, keeps identity, preserves pending storage, isolates tenants", async () => {
    const created = await createPlatformCompanyFixture({
      name: uniqueName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Purge Owner",
        email: `purge-owner-${Date.now()}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    companyIds.push(companyId);

    const other = await createPlatformCompanyFixture({
      name: uniqueName() + "-other",
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Other Owner",
        email: `purge-other-${Date.now()}@integration.test`,
      },
    });
    const otherId = other.data.company.id;
    companyIds.push(otherId);

    const pool = getPool();
    const employeeId = randomUUID();
    const phone = `+54911${Date.now().toString().slice(-8)}`;
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, employeeId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        INSERT INTO employees (id, company_id, name, phone_number, active, employee_type)
        VALUES (@id, @companyId, N'Purge Emp', @phone, 1, N'fijo')
      `);

    await pendingStorageDeletionRepository.enqueueKeys(companyId, [
      `purge-test/${companyId}/object.pdf`,
    ]);

    const otherEmpBefore = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, otherId)
      .query(`SELECT COUNT(1) AS c FROM employees WHERE company_id = @companyId`);

    await deleteCompanyOperationalDataSetBased(companyId);

    const empAfter = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(1) AS c FROM employees WHERE company_id = @companyId`);
    assert.equal(Number(empAfter.recordset[0]?.c ?? 0), 0);

    const settings = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(1) AS c FROM company_settings WHERE company_id = @companyId`);
    assert.ok(Number(settings.recordset[0]?.c ?? 0) >= 1, "identity/config still present");

    const pending = await pendingStorageDeletionRepository.countIncomplete(companyId);
    assert.ok(pending >= 1, "pending storage retained until provider delete");

    const otherEmpAfter = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, otherId)
      .query(`SELECT COUNT(1) AS c FROM employees WHERE company_id = @companyId`);
    assert.equal(
      Number(otherEmpAfter.recordset[0]?.c ?? 0),
      Number(otherEmpBefore.recordset[0]?.c ?? 0),
    );

    // Mark pending deleted so identity stage + residue can complete in fixture cleanup path.
    const due = await pendingStorageDeletionRepository.listDueForDeletion(companyId, new Date());
    for (const row of due) {
      await pendingStorageDeletionRepository.markDeleted(companyId, row.id);
    }

    await deleteCompanyIdentityAndConfigSetBased(companyId);
    const settingsAfter = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(1) AS c FROM company_settings WHERE company_id = @companyId`);
    assert.equal(Number(settingsAfter.recordset[0]?.c ?? 0), 0);

    await assertNoCompanyResidues(companyId);
  });

  it("transaction rollback leaves operational data when a statement fails", async () => {
    const created = await createPlatformCompanyFixture({
      name: uniqueName() + "-rollback",
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Rollback Owner",
        email: `purge-rb-${Date.now()}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    companyIds.push(companyId);

    const pool = getPool();
    const employeeId = randomUUID();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, employeeId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(30), `+54911${Date.now().toString().slice(-8)}`)
      .query(`
        INSERT INTO employees (id, company_id, name, phone_number, active, employee_type)
        VALUES (@id, @companyId, N'Rollback Emp', @phone, 1, N'fijo')
      `);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await deleteCompanyOperationalDataSetBased(companyId, tx);
      // Force failure before commit.
      await new sql.Request(tx).query(`THROW 50000, N'forced purge rollback', 1`);
      await tx.commit();
      assert.fail("expected throw");
    } catch {
      try {
        await tx.rollback();
      } catch {
        /* ignore */
      }
    }

    const emp = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(1) AS c FROM employees WHERE company_id = @companyId`);
    assert.equal(Number(emp.recordset[0]?.c ?? 0), 1);
  });
});
