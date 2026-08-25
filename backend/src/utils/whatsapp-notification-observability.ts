/**
 * Structured WhatsApp notification / location observability.
 * Logs only — never secrets, GPS coordinates, or template variable values.
 */

export type WhatsAppNotificationProducer =
  | "ATTENDANCE_REMINDER_JOB"
  | "ASSIGNMENT_NOTIFICATION_WORKER"
  | "BOT_CONFIRMATION_RESPONSE"
  | "BOT_CHECK_IN"
  | "BOT_CHECK_OUT"
  | "BOT_TWIML_RESPONSE";

export type WhatsAppAttendanceLocationEvent =
  | "LOCATION_RECEIVED"
  | "LOCATION_ATTENDANCE_RECORDED"
  | "WHATSAPP_NOTIFICATION_SENT"
  | "WHATSAPP_NOTIFICATION_FAILED";

export interface WhatsAppNotificationEventLog {
  event: "WHATSAPP_NOTIFICATION_SENT" | "WHATSAPP_NOTIFICATION_FAILED";
  producer: WhatsAppNotificationProducer;
  companyId: string;
  employeeId: string | null;
  operationId?: string | null;
  operationAssignmentId?: string | null;
  notificationType: string;
  templateSid: string | null;
  /** Full variable map is never logged — only keys/count for contract forensics. */
  templateVariables?: Record<string, string> | null;
  scheduleVersion?: number | null;
  notificationId?: string | null;
  attempt?: number | null;
  providerMessageSid?: string | null;
  sentAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export const summarizeTemplateVariables = (
  variables: Record<string, string> | null | undefined,
): { templateVariableKeys: string[]; templateVariableCount: number } => {
  if (!variables) {
    return { templateVariableKeys: [], templateVariableCount: 0 };
  }
  const templateVariableKeys = Object.keys(variables).sort();
  return {
    templateVariableKeys,
    templateVariableCount: templateVariableKeys.length,
  };
};

export const logWhatsAppAttendanceEvent = (
  event: WhatsAppAttendanceLocationEvent,
  fields: Record<string, unknown>,
): void => {
  const payload = { event, ...fields };
  if (event === "WHATSAPP_NOTIFICATION_FAILED") {
    console.warn("[whatsapp-attendance]", payload);
    return;
  }
  console.info("[whatsapp-attendance]", payload);
};

export const logWhatsAppNotificationEvent = (input: WhatsAppNotificationEventLog): void => {
  const { templateVariableKeys, templateVariableCount } = summarizeTemplateVariables(
    input.templateVariables,
  );
  logWhatsAppAttendanceEvent(input.event, {
    producer: input.producer,
    companyId: input.companyId,
    employeeId: input.employeeId,
    operationId: input.operationId ?? null,
    operationAssignmentId: input.operationAssignmentId ?? null,
    notificationType: input.notificationType,
    templateSid: input.templateSid,
    templateVariableKeys,
    templateVariableCount,
    scheduleVersion: input.scheduleVersion ?? null,
    notificationId: input.notificationId ?? null,
    attempt: input.attempt ?? null,
    providerMessageSid: input.providerMessageSid ?? null,
    sentAt: input.sentAt ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
  });
};

export type TwilioContentSidConfig = {
  ARRIVAL?: string | null;
  EXIT?: string | null;
  NO_CHECKIN?: string | null;
  ATTENDANCE_CONFIRMATION?: string | null;
  EVENTUAL_ASSIGNMENT?: string | null;
  ADMIN_OPERATIONAL?: string | null;
  ADMIN_REQUEST?: string | null;
};

export type ContentSidCollision = {
  left: keyof TwilioContentSidConfig;
  right: keyof TwilioContentSidConfig;
  contentSid: string;
};

/**
 * Detect accidental duplicate Content SIDs across distinct notification templates.
 * Empty / whitespace SIDs are ignored (treated as not configured).
 */
export const findDuplicateTwilioContentSids = (
  config: TwilioContentSidConfig,
): ContentSidCollision[] => {
  const entries = (
    Object.entries(config) as [keyof TwilioContentSidConfig, string | null | undefined][]
  )
    .map(([key, value]) => [key, typeof value === "string" ? value.trim() : ""] as const)
    .filter(([, value]) => value.length > 0);

  const collisions: ContentSidCollision[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      if (entries[i][1] === entries[j][1]) {
        collisions.push({
          left: entries[i][0],
          right: entries[j][0],
          contentSid: entries[i][1],
        });
      }
    }
  }
  return collisions;
};

/** Startup / diagnostic — does not throw (fail-open for boot). */
export const warnOnDuplicateTwilioContentSids = (
  config: TwilioContentSidConfig,
): ContentSidCollision[] => {
  const collisions = findDuplicateTwilioContentSids(config);
  for (const collision of collisions) {
    console.error("[whatsapp-attendance]", {
      event: "TWILIO_CONTENT_SID_COLLISION",
      left: collision.left,
      right: collision.right,
      contentSid: collision.contentSid,
      message:
        "Distinct WhatsApp notification templates share the same Twilio Content SID. Verify Console / env mapping before attributing duplicate outbound UX to job duplication.",
    });
  }
  return collisions;
};
