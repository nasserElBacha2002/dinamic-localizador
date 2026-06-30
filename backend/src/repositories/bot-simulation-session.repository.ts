import sql from "mssql";
import { getPool } from "../database/connection";
import type { BotSimulationSession } from "../types/bot-simulator.types";
import type { BotSimulationMode, BotSimulatorMessage } from "../utils/bot-runtime-context";

type BotSimulationSessionRow = {
  id: string;
  company_id: string | null;
  employee_id: string;
  inventory_id: string | null;
  store_id: string | null;
  phone_number: string;
  simulated_now: Date;
  mode: BotSimulationMode;
  messages_json: string;
  technical_details_json: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapSession(row: BotSimulationSessionRow): BotSimulationSession {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    inventoryId: row.inventory_id,
    storeId: row.store_id,
    phoneNumber: row.phone_number,
    simulatedNow: row.simulated_now.toISOString(),
    mode: row.mode,
    messages: JSON.parse(row.messages_json) as BotSimulatorMessage[],
    technicalDetails: JSON.parse(row.technical_details_json) as Record<string, unknown>,
    createdRecords: [],
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const botSimulationSessionRepository = {
  async create(input: {
    companyId?: string | null;
    employeeId: string;
    inventoryId?: string | null;
    storeId?: string | null;
    phoneNumber: string;
    simulatedNow: string;
    mode: BotSimulationMode;
    createdBy?: string | null;
  }): Promise<BotSimulationSession> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId ?? null)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId ?? null)
      .input("storeId", sql.UniqueIdentifier, input.storeId ?? null)
      .input("phoneNumber", sql.NVarChar(30), input.phoneNumber)
      .input("simulatedNow", sql.DateTime2, new Date(input.simulatedNow))
      .input("mode", sql.NVarChar(20), input.mode)
      .input("createdBy", sql.UniqueIdentifier, input.createdBy ?? null)
      .query(`
        INSERT INTO bot_simulation_sessions (
          company_id, employee_id, inventory_id, store_id,
          phone_number, simulated_now, mode, created_by
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @employeeId, @inventoryId, @storeId,
          @phoneNumber, @simulatedNow, @mode, @createdBy
        )
      `);

    return mapSession(result.recordset[0] as BotSimulationSessionRow);
  },

  async findById(id: string): Promise<BotSimulationSession | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM bot_simulation_sessions WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapSession(result.recordset[0] as BotSimulationSessionRow);
  },

  async updateConversation(
    id: string,
    input: {
      messages: BotSimulatorMessage[];
      technicalDetails: Record<string, unknown>;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("messagesJson", sql.NVarChar(sql.MAX), JSON.stringify(input.messages))
      .input("technicalDetailsJson", sql.NVarChar(sql.MAX), JSON.stringify(input.technicalDetails))
      .query(`
        UPDATE bot_simulation_sessions
        SET messages_json = @messagesJson,
            technical_details_json = @technicalDetailsJson,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
  },

  async resetConversation(id: string): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE bot_simulation_sessions
        SET messages_json = '[]',
            technical_details_json = '{}',
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
  },
};
