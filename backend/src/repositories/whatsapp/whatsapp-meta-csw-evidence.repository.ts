import sql from "mssql";
import { getPool } from "../../database/connection";
import { tryNormalizeWhatsAppPhone } from "../../utils/phone";

/**
 * Evidence for Meta customer service window (CSW): inbound user message within 24h before outbound.
 * Returns null when company or phone cannot be resolved (not verifiable).
 */
export const whatsappMetaCswEvidenceRepository = {
  async resolveCustomerServiceWindowOpen(input: {
    companyId: string | null;
    customerPhone: string;
    at: Date;
  }): Promise<boolean | null> {
    if (!input.companyId?.trim()) {
      return null;
    }
    const normalizedCustomer = tryNormalizeWhatsAppPhone(
      input.customerPhone.startsWith("whatsapp:") ? input.customerPhone : `whatsapp:${input.customerPhone}`,
    );
    if (!normalizedCustomer) {
      return null;
    }

    const pool = getPool();
    const windowStart = new Date(input.at.getTime() - 24 * 60 * 60 * 1000);
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("phoneFrom", sql.NVarChar(40), normalizedCustomer)
      .input("windowStart", sql.DateTime2, windowStart)
      .input("at", sql.DateTime2, input.at)
      .query(`
        SELECT TOP (1) 1 AS found
        FROM dbo.whatsapp_messages
        WHERE company_id = @companyId
          AND direction = N'INBOUND'
          AND phone_from = @phoneFrom
          AND COALESCE(sent_at, created_at) >= @windowStart
          AND COALESCE(sent_at, created_at) < @at
      `);

    return result.recordset[0] ? true : false;
  },
};