/**
 * DIN-462 — read-only report of likely integration-test rows (no DELETE).
 */
import { connectDatabase, closeDatabase, getPool } from "../database/connection";

const main = async (): Promise<void> => {
  if (process.env.DINAMIC_TEST_SQL_ACTIVE === "true") {
    throw new Error("Refusing historical audit on ephemeral test session.");
  }

  await connectDatabase();
  const pool = getPool();

  const queries = [
    {
      label: "users_integration_emails",
      sql: `
        SELECT TOP 200 id, email, created_at
        FROM users
        WHERE email LIKE '%@integration.test' OR email LIKE '%@test.local'
        ORDER BY created_at DESC
      `,
    },
    {
      label: "employees_integration_names",
      sql: `
        SELECT TOP 200 id, company_id, name, created_at
        FROM employees
        WHERE name LIKE N'% Integration' OR name LIKE N'Emp %' OR name LIKE N'CI Test%'
        ORDER BY created_at DESC
      `,
    },
    {
      label: "companies_integration_names",
      sql: `
        SELECT TOP 200 id, name, created_at
        FROM companies
        WHERE name LIKE N'Integration Test Co%'
        ORDER BY created_at DESC
      `,
    },
  ];

  for (const query of queries) {
    const result = await pool.request().query(query.sql);
    console.log(`\n[audit-historical-test-data] ${query.label} count=${result.recordset.length}`);
    for (const row of result.recordset) {
      console.log(JSON.stringify(row));
    }
  }

  await closeDatabase();
};

void main().catch((error: unknown) => {
  console.error("audit-historical-test-data-candidates failed:", error);
  process.exit(1);
});