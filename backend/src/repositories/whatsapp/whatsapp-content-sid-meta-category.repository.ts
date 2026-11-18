import sql from "mssql";
import { getPool } from "../../database/connection";
import type { MetaBillingCategory } from "../../constants/whatsapp-message-cost";

export const whatsappContentSidMetaCategoryRepository = {
  async findCategoryAt(contentSid: string, at: Date): Promise<MetaBillingCategory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("contentSid", sql.NVarChar(100), contentSid)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT TOP (1) meta_billing_category
        FROM dbo.whatsapp_content_sid_meta_category
        WHERE content_sid = @contentSid
          AND effective_from <= @at
          AND (effective_to IS NULL OR effective_to > @at)
        ORDER BY effective_from DESC;
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return String(row.meta_billing_category) as MetaBillingCategory;
  },
};