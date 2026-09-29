import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

describeDatabaseIntegration("migration 150 replacement request tenant constraints", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("installs composite request ownership foreign keys and workflow checkpoints", async () => {
    const result = await getPool().request().query(`
      SELECT fk.name, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) parent_column,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) referenced_column
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
      WHERE fk.parent_object_id IN (
        OBJECT_ID(N'dbo.replacement_requests'),
        OBJECT_ID(N'dbo.replacement_request_candidates'),
        OBJECT_ID(N'dbo.replacement_request_notifications')
      )
      ORDER BY fk.name, fkc.constraint_column_id;
    `);
    const tuples = result.recordset.map((row: Record<string, unknown>) =>
      `${String(row.name)}:${String(row.parent_column)}:${String(row.referenced_column)}`,
    );

    assert.ok(tuples.includes("FK_replacement_requests_root:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_requests_root:root_request_id:id"));
    assert.ok(tuples.includes("FK_replacement_requests_parent:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_requests_parent:parent_request_id:id"));
    assert.ok(tuples.includes("FK_replacement_candidates_request:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_candidates_request:request_id:id"));
    assert.ok(tuples.includes("FK_replacement_notifications_request:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_notifications_request:request_id:id"));

    const columns = await getPool().request().query(`
      SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.replacement_requests')
        AND name IN (N'candidates_materialized_at', N'notifications_materialized_at')
    `);
    assert.equal(columns.recordset.length, 2);
  });

  it("rejects a candidate whose company differs from its request", async () => {
    const ids = await getPool().request().query(`
      SELECT TOP 2 id FROM companies WHERE status=N'ACTIVE' ORDER BY created_at
    `);
    assert.ok(ids.recordset.length >= 2, "integration fixture requires two active companies");
    const companyA = String(ids.recordset[0].id);
    const companyB = String(ids.recordset[1].id);
    const request = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .query(`SELECT TOP 1 id FROM replacement_requests WHERE company_id=@companyId`);
    assert.ok(request.recordset[0], "integration fixture requires a replacement request in company A");

    await assert.rejects(
      getPool().request()
        .input("companyA", sql.UniqueIdentifier, companyA)
        .input("companyB", sql.UniqueIdentifier, companyB)
        .input("requestId", sql.UniqueIdentifier, String(request.recordset[0].id))
        .query(`INSERT INTO replacement_request_candidates(company_id,request_id,employee_id,rank)
          SELECT @companyB,@requestId,e.id,3 FROM employees e WHERE e.company_id=@companyB
          AND NOT EXISTS(SELECT 1 FROM replacement_request_candidates WHERE request_id=@requestId AND rank=3)`),
    );
  });
});
