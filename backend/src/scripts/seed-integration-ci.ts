import { config } from "dotenv";
import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { hashPassword, normalizeEmail } from "../utils/password";

config();

const ensureDinamicCompanyId = async (pool: sql.ConnectionPool): Promise<string> => {
  const result = await pool.request().query(`
    SELECT TOP 1 id
    FROM companies
    WHERE name = N'Dinamic Systems'
    ORDER BY created_at ASC
  `);
  const companyId = result.recordset[0]?.id ? String(result.recordset[0].id) : "";
  if (!companyId) {
    throw new Error("Dinamic Systems company is missing after migrations");
  }
  return companyId;
};

const ensurePlatformAdmin = async (
  pool: sql.ConnectionPool,
  companyId: string,
): Promise<void> => {
  const email = normalizeEmail(process.env.ADMIN_EMAIL?.trim() || "admin@dinamicsystems.com");
  const password = process.env.ADMIN_PASSWORD ?? "ci-test-password-123";
  const name = process.env.ADMIN_NAME?.trim() || "CI Platform Admin";

  const existing = await pool
    .request()
    .input("email", sql.NVarChar(255), email)
    .query(`SELECT id FROM users WHERE email = @email`);

  let userId = existing.recordset[0]?.id ? String(existing.recordset[0].id) : "";

  if (!userId) {
    const passwordHash = await hashPassword(password);
    const created = await pool
      .request()
      .input("name", sql.NVarChar(150), name)
      .input("email", sql.NVarChar(255), email)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .query(`
        INSERT INTO users (name, email, password_hash, role, active, is_platform_admin)
        OUTPUT INSERTED.id
        VALUES (@name, @email, @passwordHash, N'ADMIN', 1, 1)
      `);
    userId = String(created.recordset[0].id);
  } else {
    await pool.request().input("email", sql.NVarChar(255), email).query(`
      UPDATE users
      SET is_platform_admin = 1, active = 1
      WHERE email = @email
    `);
  }

  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM user_company_memberships
        WHERE user_id = @userId AND company_id = @companyId
      )
      BEGIN
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'OWNER', N'ACTIVE', 1);
      END
    `);
};

const ensureOperationalLocation = async (
  pool: sql.ConnectionPool,
  companyId: string,
): Promise<void> => {
  const existing = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT TOP 1 id
      FROM operational_locations
      WHERE company_id = @companyId AND active = 1
    `);

  if (existing.recordset[0]) {
    return;
  }

  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    INSERT INTO operational_locations (
      company_id,
      name,
      address,
      latitude,
      longitude,
      allowed_radius_meters,
      active
    )
    VALUES (
      @companyId,
      N'CI Test Location',
      N'CI Address 1',
      -34.6037000,
      -58.3816000,
      150,
      1
    )
  `);
};

const ensureEmployee = async (pool: sql.ConnectionPool, companyId: string): Promise<void> => {
  const existing = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT TOP 1 id
      FROM employees
      WHERE company_id = @companyId AND active = 1
    `);

  if (existing.recordset[0]) {
    return;
  }

  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    INSERT INTO employees (
      company_id,
      name,
      phone_number,
      document_number,
      employee_type,
      active
    )
    VALUES (
      @companyId,
      N'CI Test Employee',
      N'+5491100000001',
      NULL,
      N'fijo',
      1
    )
  `);
};

const main = async (): Promise<void> => {
  await connectDatabase();
  const pool = getPool();

  try {
    const companyId = await ensureDinamicCompanyId(pool);
    await ensurePlatformAdmin(pool, companyId);
    await ensureOperationalLocation(pool, companyId);
    await ensureEmployee(pool, companyId);
    console.log("CI integration seed completed.");
  } finally {
    await closeDatabase();
  }
};

void main().catch((error: unknown) => {
  console.error("Failed to seed CI integration fixtures:", error);
  process.exit(1);
});
