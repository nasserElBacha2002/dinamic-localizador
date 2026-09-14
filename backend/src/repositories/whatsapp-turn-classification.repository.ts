import sql from "mssql";
import { getPool } from "../database/connection";
import type { WhatsAppTurnClassificationRecord } from "../types/whatsapp-turn-classification";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

export const whatsappTurnClassificationRepository = {
  /**
   * Insert classification once per MessageSid.
   * On unique race, returns inserted=false without treating other SQL errors as duplicates.
   */
  async insertIgnoreDuplicate(input: WhatsAppTurnClassificationRecord): Promise<{
    inserted: boolean;
  }> {
    try {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("messageSid", sql.NVarChar(64), input.messageSid)
        .input("messageType", sql.NVarChar(20), input.messageType)
        .input("origin", sql.NVarChar(20), input.origin)
        .input("classification", sql.NVarChar(40), input.classification)
        .input("category", sql.NVarChar(80), input.category)
        .input("reasonCode", sql.NVarChar(80), input.reasonCode)
        .input("ruleVersion", sql.NVarChar(20), input.ruleVersion)
        .input("activeSessionIntent", sql.NVarChar(80), input.activeSessionIntent)
        .input("activeSessionState", sql.NVarChar(80), input.activeSessionState)
        .input("resolvedIntent", sql.NVarChar(80), input.resolvedIntent)
        .input("resolvedHandler", sql.NVarChar(80), input.resolvedHandler)
        .input("relatedOperationId", sql.UniqueIdentifier, input.relatedOperationId ?? null)
        .input("systemInteractionId", sql.UniqueIdentifier, input.systemInteractionId ?? null)
        .input("causationMessageSid", sql.NVarChar(64), input.causationMessageSid ?? null)
        .input("classifiedAt", sql.DateTime2, new Date(input.classifiedAt))
        .query(`
          INSERT INTO dbo.whatsapp_turn_classifications (
            company_id, employee_id, message_sid, message_type,
            origin, classification, category, reason_code, rule_version,
            active_session_intent, active_session_state,
            resolved_intent, resolved_handler,
            related_operation_id, system_interaction_id, causation_message_sid, classified_at
          )
          VALUES (
            @companyId, @employeeId, @messageSid, @messageType,
            @origin, @classification, @category, @reasonCode, @ruleVersion,
            @activeSessionIntent, @activeSessionState,
            @resolvedIntent, @resolvedHandler,
            @relatedOperationId, @systemInteractionId, @causationMessageSid, @classifiedAt
          );
        `);
      return { inserted: true };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return { inserted: false };
      }
      throw error;
    }
  },
};
