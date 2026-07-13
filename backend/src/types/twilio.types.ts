export type BotSessionState =
  | "WAITING_LOCATION"
  | "WAITING_OPERATION_SELECTION"
  | "WAITING_CHECKOUT_LOCATION"
  | "WAITING_CHECKOUT_OPERATION_SELECTION"
  | "WAITING_ABSENCE_TYPE"
  | "WAITING_ABSENCE_START_DATE"
  | "WAITING_ABSENCE_END_DATE"
  | "WAITING_ABSENCE_REASON"
  | "WAITING_ABSENCE_CONFIRMATION"
  | "WAITING_CONFIRM_ATTENDANCE_SELECTION"
  | "WAITING_UNAVAILABILITY_SELECTION"
  | "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export type WhatsAppMessageDirection = "INBOUND" | "OUTBOUND";
export type WhatsAppMessageType = "TEXT" | "LOCATION" | "UNKNOWN";

export interface BotSession {
  id: string;
  companyId: string;
  employeeId: string;
  operationId: string | null;
  employeeWorkdayId: string | null;
  attendanceRecordId: string | null;
  phoneNumber: string;
  state: BotSessionState;
  contextJson: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationSelectionOption {
  operationId: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  scheduledStart: string;
}

export interface WorkdaySessionSelectionOption {
  employeeWorkdayId: string;
  operationWorkdayId: string;
  operationId: string;
  attendanceRecordId?: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  expectedStartAt: string;
  expectedEndAt: string | null;
  workDate: string;
  checkInAt?: string;
}

export interface BotSessionContext {
  workdayOptions?: WorkdaySessionSelectionOption[];
  operationOptions?: OperationSelectionOption[];
  /** @deprecated Read compat — see legacy-operation-session-context.ts */
  inventoryOptions?: OperationSelectionOption[];
  flow?: "ABSENCE_REQUEST";
  attendanceConfirmation?: {
    operationId: string;
    /** @deprecated Read compat for sessions created before Phase 3 rename */
    inventoryId?: string;
    notificationId?: string;
    scheduleVersion: number;
  };
  absenceDraft?: {
    absenceTypeId?: string;
    absenceTypeCode?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  };
}

export type WhatsAppMessageProcessingStatus = "RECEIVED" | "PROCESSED" | "FAILED" | "DUPLICATE";

export interface WhatsAppMessage {
  id: string;
  messageSid: string | null;
  direction: WhatsAppMessageDirection;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
  messageType: WhatsAppMessageType;
  body: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  rawPayload: string | null;
  processingStatus: WhatsAppMessageProcessingStatus | null;
  processingErrorCode: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface TwilioWebhookPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body?: string;
  Latitude?: string;
  Longitude?: string;
  Address?: string;
  Label?: string;
  NumMedia?: string;
}

export interface CompatibleOperation {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  serviceLatitude: number;
  serviceLongitude: number;
  allowedRadiusMeters: number;
  scheduledStart: string;
  scheduledEnd: string | null;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  status: string;
}

export interface CheckoutEligibleOperation extends CompatibleOperation {
  attendanceId: string;
}
