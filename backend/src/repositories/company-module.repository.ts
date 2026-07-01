import sql from "mssql";
import { DEFAULT_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { getPool } from "../database/connection";
import type { CompanyModule } from "../types/company";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapCompanyModuleRow = (row: Record<string, unknown>): CompanyModule => ({
  id: String(row.id),
  companyId: String(row.company_id),
  moduleKey: String(row.module_key),
  isEnabled: Boolean(row.is_enabled),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyModuleRepository = {
  async listByCompanyId(companyId: string): Promise<CompanyModule[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_modules
        WHERE company_id = @companyId
        ORDER BY module_key ASC
      `);

    return result.recordset.map((row) => mapCompanyModuleRow(row as Record<string, unknown>));
  },

  async isEnabled(companyId: string, moduleKey: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("moduleKey", sql.NVarChar(80), moduleKey)
      .query(`
        SELECT TOP 1 is_enabled
        FROM company_modules
        WHERE company_id = @companyId AND module_key = @moduleKey
      `);

    if (!result.recordset[0]) {
      return false;
    }

    return Boolean(result.recordset[0].is_enabled);
  },

  async setEnabled(
    companyId: string,
    moduleKey: string,
    isEnabled: boolean,
    transaction?: sql.Transaction,
  ): Promise<CompanyModule> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("moduleKey", sql.NVarChar(80), moduleKey)
      .input("isEnabled", sql.Bit, isEnabled ? 1 : 0)
      .query(`
        MERGE company_modules AS target
        USING (
          SELECT @companyId AS company_id, @moduleKey AS module_key, @isEnabled AS is_enabled
        ) AS source
        ON target.company_id = source.company_id AND target.module_key = source.module_key
        WHEN MATCHED THEN
          UPDATE SET
            is_enabled = source.is_enabled,
            updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (company_id, module_key, is_enabled)
          VALUES (source.company_id, source.module_key, source.is_enabled)
        OUTPUT INSERTED.*;
      `);

    return mapCompanyModuleRow(result.recordset[0] as Record<string, unknown>);
  },

  async bulkSet(
    companyId: string,
    modules: Array<{ moduleKey: string; isEnabled: boolean }>,
  ): Promise<void> {
    if (modules.length === 0) {
      return;
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const module of modules) {
        await this.setEnabled(companyId, module.moduleKey, module.isEnabled, transaction);
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async bulkEnable(
    companyId: string,
    moduleKeys: string[],
    transaction?: sql.Transaction,
  ): Promise<void> {
    const uniqueModuleKeys = [...new Set(moduleKeys)];
    if (uniqueModuleKeys.length === 0) {
      return;
    }

    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);

    const values = uniqueModuleKeys
      .map((moduleKey, index) => {
        request.input(`moduleKey${index}`, sql.NVarChar(80), moduleKey);
        return `(@companyId, @moduleKey${index}, 1)`;
      })
      .join(", ");

    await request.query(`
      INSERT INTO company_modules (company_id, module_key, is_enabled)
      VALUES ${values}
    `);
  },

  async ensureDefaults(companyId: string): Promise<void> {
    const existing = await this.listByCompanyId(companyId);
    const existingKeys = new Set(existing.map((module) => module.moduleKey));
    const missing = DEFAULT_COMPANY_MODULE_KEYS.filter((moduleKey) => !existingKeys.has(moduleKey));

    if (missing.length === 0) {
      return;
    }

    try {
      await this.bulkEnable(companyId, missing);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },
};
