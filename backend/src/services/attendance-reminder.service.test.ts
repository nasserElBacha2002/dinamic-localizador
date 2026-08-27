import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  ATTENDANCE_REMINDER_MAX_ATTEMPTS,
  CONFIRMATION_BLOCKED_BY_ACTIVE_ATTENDANCE_SESSION,
  CONFIRMATION_BLOCKED_BY_ACTIVE_SESSION_CONFLICT,
  NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_ALREADY_CHECKED_IN,
  NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_REMINDER,
  NO_LONGER_ELIGIBLE_FOR_NO_CHECKIN_AT_START,
} from "../constants/attendance-notification";
import { WHATSAPP_RESULT_CODES } from "../constants/whatsapp-observability";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

type EnvConfig = typeof import("../config/env").env;

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const OPERATION_ID = "22222222-2222-2222-2222-222222222222";
const EMPLOYEE_ID = "33333333-3333-3333-3333-333333333333";

const candidate = {
  operationId: OPERATION_ID,
  employeeId: EMPLOYEE_ID,
  employeeName: "Ana",
  employeePhoneNumber: "+5491112345678",
  serviceName: "Centro",
  serviceAddress: null,
  serviceLocality: null,
  scheduledStart: "2026-06-23T14:00:00.000Z",
  scheduledEnd: "2026-06-23T22:00:00.000Z",
  scheduleVersion: 1,
  confirmationReminderHoursBefore: 24,
  operationKind: "ONE_TIME" as const,
  employeeWorkdayId: "66666666-6666-6666-6666-666666666666",
  operationWorkdayId: "77777777-7777-7777-7777-777777777777",
};

const claimedNotification = {
  id: "44444444-4444-4444-4444-444444444444",
  operationId: OPERATION_ID,
  employeeId: EMPLOYEE_ID,
  notificationType: "NO_CHECKIN_AT_START" as const,
  twilioMessageSid: null,
  status: "PENDING" as const,
  errorMessage: null,
  sentAt: null,
  attemptCount: 1,
  lastAttemptAt: "2026-06-23T14:00:00.000Z",
  createdAt: "2026-06-23T14:00:00.000Z",
};


const confirmationSession = {
  id: "session-confirmation",
  companyId: COMPANY_ID,
  employeeId: EMPLOYEE_ID,
  operationId: OPERATION_ID,
  phoneNumber: candidate.employeePhoneNumber,
  state: "WAITING_ATTENDANCE_CONFIRMATION_RESPONSE" as const,
  contextJson: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-06-23T14:00:00.000Z",
  updatedAt: "2026-06-23T14:00:00.000Z",
};

const createdConfirmationSessionResult = {
  status: "CREATED" as const,
  session: confirmationSession,
};

const configureTwilioEnv = (env: EnvConfig): void => {
  env.TWILIO_ACCOUNT_SID = "AC_TEST";
  env.TWILIO_AUTH_TOKEN = "auth";
  env.TWILIO_WHATSAPP_NUMBER = "whatsapp:+10000000000";
  env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID = "HX_ARRIVAL";
  env.TWILIO_EXIT_REMINDER_CONTENT_SID = "HX_EXIT";
  env.TWILIO_TEMPLATE_NO_CHECKIN_SID = "HX_NO_CHECKIN";
  env.TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID = "HX_CONFIRMATION";
  env.ATTENDANCE_REMINDER_JOB_ENABLED = true;
};

describe("attendanceReminderService", () => {
  beforeEach(async () => {
    setupUnitTestEnv();
    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    mock.method(attendanceNotificationRepository, "reconcileSentRecoveryRequired", async () => 0);
    mock.method(attendanceNotificationRepository, "isArrivalReminderEligible", async () => true);
    mock.method(attendanceNotificationRepository, "isExitReminderEligible", async () => true);
  });

  afterEach(async () => {
    const { __setConfirmationReminderPreSendBarrierForTests } = await import(
      "./attendance-reminder.service"
    );
    __setConfirmationReminderPreSendBarrierForTests(null);
    mock.restoreAll();
  });

  it("does not call Twilio when attempt claim returns null", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    const claimMock = mock.method(
      attendanceNotificationRepository,
      "claimNotificationForAttempt",
      async () => null,
    );
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_TEST",
    }));
    const findCandidateMock = mock.method(
      attendanceNotificationRepository,
      "findReminderCandidateByIds",
      async () => candidate,
    );

    const outcome = await attendanceReminderService.sendTestReminder(COMPANY_ID, {
      operationId: OPERATION_ID,
      employeeId: EMPLOYEE_ID,
      notificationType: "ARRIVAL_REMINDER_15_MIN",
    });

    assert.equal(outcome, "skipped");
    assert.equal(claimMock.mock.callCount(), 1);
    assert.equal(sendMock.mock.callCount(), 0);

    claimMock.mock.restore();
    sendMock.mock.restore();
    findCandidateMock.mock.restore();
  });

  it("sends no-check-in notification with template variables and content SID", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findReminderCandidateByIds", async () => candidate);
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => true);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "NO_CHECKIN_AT_START",
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_NO_CHECKIN",
    }));
    const markSentMock = mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    const outcome = await attendanceReminderService.sendTestReminder(COMPANY_ID, {
      operationId: OPERATION_ID,
      employeeId: EMPLOYEE_ID,
      notificationType: "NO_CHECKIN_AT_START",
    });

    assert.equal(outcome, "sent");
    assert.equal(sendMock.mock.callCount(), 1);
    const sendInput = sendMock.mock.calls[0]?.arguments[0] as {
      contentSid: string;
      contentVariables: Record<string, string>;
      toPhoneNumber: string;
    };
    assert.equal(sendInput.contentSid, "HX_NO_CHECKIN");
    assert.equal(sendInput.contentVariables["1"], "Ana");
    assert.equal(sendInput.contentVariables["2"], "Centro");
    assert.equal(sendInput.toPhoneNumber, "+5491112345678");
    assert.equal(markSentMock.mock.callCount(), 1);
  });

  it("skips no-check-in notification when template SID is missing without crashing", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);
    env.TWILIO_TEMPLATE_NO_CHECKIN_SID = undefined;

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findReminderCandidateByIds", async () => candidate);
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => true);
    const claimMock = mock.method(
      attendanceNotificationRepository,
      "claimNotificationForAttempt",
      async () => claimedNotification,
    );
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_NO_CHECKIN",
    }));

    const outcome = await attendanceReminderService.sendTestReminder(COMPANY_ID, {
      operationId: OPERATION_ID,
      employeeId: EMPLOYEE_ID,
      notificationType: "NO_CHECKIN_AT_START",
    });

    assert.equal(outcome, "skipped");
    assert.equal(claimMock.mock.callCount(), 0);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  it("persists Twilio failures for no-check-in notifications", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findReminderCandidateByIds", async () => candidate);
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => true);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "NO_CHECKIN_AT_START",
    }));
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      throw new Error("TWILIO_SEND_FAILED");
    });
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );

    const outcome = await attendanceReminderService.sendTestReminder(COMPANY_ID, {
      operationId: OPERATION_ID,
      employeeId: EMPLOYEE_ID,
      notificationType: "NO_CHECKIN_AT_START",
    });

    assert.equal(outcome, "failed");
    assert.equal(markFailedMock.mock.callCount(), 1);
    const failedInput = markFailedMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(failedInput.errorMessage, "TWILIO_SEND_FAILED");
  });

  it("marks missing WhatsApp phone as failed with a clear reason", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findReminderCandidateByIds", async () => ({
      ...candidate,
      employeePhoneNumber: "   ",
    }));
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => true);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "NO_CHECKIN_AT_START",
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_NO_CHECKIN",
    }));
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );

    const outcome = await attendanceReminderService.sendTestReminder(COMPANY_ID, {
      operationId: OPERATION_ID,
      employeeId: EMPLOYEE_ID,
      notificationType: "NO_CHECKIN_AT_START",
    });

    assert.equal(outcome, "failed");
    assert.equal(sendMock.mock.callCount(), 0);
    const failedInput = markFailedMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(failedInput.errorMessage, "EMPLOYEE_WHATSAPP_PHONE_MISSING");
  });

  it("does not send duplicate notifications when claim returns null on repeated runs", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findReminderCandidateByIds", async () => candidate);
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => true);
    const claimMock = mock.method(
      attendanceNotificationRepository,
      "claimNotificationForAttempt",
      async () => null,
    );
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_NO_CHECKIN",
    }));

    const outcome = await attendanceReminderService.sendTestReminder(COMPANY_ID, {
      operationId: OPERATION_ID,
      employeeId: EMPLOYEE_ID,
      notificationType: "NO_CHECKIN_AT_START",
    });

    assert.equal(outcome, "skipped");
    assert.equal(claimMock.mock.callCount(), 1);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  it("processes no-check-in candidates during scheduled run without affecting arrival reminders", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => [
      candidate,
    ]);
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => true);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "NO_CHECKIN_AT_START",
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_NO_CHECKIN",
    }));
    mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.arrivalCandidates, 0);
    assert.equal(summary.noCheckInCandidates, 1);
    assert.equal(summary.noCheckInSent, 1);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  it("skips scheduled no-check-in send when eligibility changes after candidate fetch", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => [
      candidate,
    ]);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "NO_CHECKIN_AT_START",
    }));
    mock.method(attendanceNotificationRepository, "isNoCheckInAtStartEligible", async () => false);
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_NO_CHECKIN",
    }));
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.noCheckInCandidates, 1);
    assert.equal(summary.noCheckInSent, 0);
    assert.equal(summary.noCheckInSkipped, 1);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markSupersededMock.mock.callCount(), 1);
    assert.equal(markFailedMock.mock.callCount(), 0);
    const supersededInput = markSupersededMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(supersededInput.errorMessage, NO_LONGER_ELIGIBLE_FOR_NO_CHECKIN_AT_START);
  });

  it("sends confirmation reminder and creates response session when eligible", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 2,
      confirmationReminderHoursBefore: 24,
      operationTimezone: "America/Argentina/Buenos_Aires",
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_CONFIRMATION",
    }));
    mock.method(attendanceNotificationRepository, "markSent", async () => undefined);
    const sessionMock = mock.method(
      botSessionService,
      "createAttendanceConfirmationResponseSession",
      async () => createdConfirmationSessionResult,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationCandidates, 1);
    assert.equal(summary.confirmationSent, 1);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(sessionMock.mock.callCount(), 1);
  });

  it("A3: skips confirmation reminder when employee already checked in after claim", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ALREADY_CHECKED_IN");
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_SHOULD_NOT_SEND",
    }));
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationSkipped, 1);
    assert.equal(summary.confirmationSent, 0);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markSupersededMock.mock.callCount(), 1);
    const supersededInput = markSupersededMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(supersededInput.errorMessage, NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_ALREADY_CHECKED_IN);
  });

  it("A2: skips confirmation send when physical attendance session blocks session create", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () => ({
      status: "BLOCKED_BY_PHYSICAL_ATTENDANCE" as const,
      activeSessionId: "session-waiting-location",
      activeState: "WAITING_LOCATION" as const,
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_SHOULD_NOT_SEND",
    }));
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationSkipped, 1);
    assert.equal(summary.confirmationSent, 0);
    assert.equal(sendMock.mock.callCount(), 0);
    const supersededInput = markSupersededMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(supersededInput.errorMessage, CONFIRMATION_BLOCKED_BY_ACTIVE_ATTENDANCE_SESSION);
  });

  it("skips confirmation reminder when eligibility changes after candidate fetch", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "NOT_ELIGIBLE");
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_CONFIRMATION",
    }));
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationCandidates, 1);
    assert.equal(summary.confirmationSent, 0);
    assert.equal(summary.confirmationSkipped, 1);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markSupersededMock.mock.callCount(), 1);
    assert.equal(markFailedMock.mock.callCount(), 0);
    const supersededInput = markSupersededMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(supersededInput.errorMessage, NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_REMINDER);
  });

  it("does not mark confirmation reminder failed when markSent throws after Twilio success", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () =>
      createdConfirmationSessionResult,
    );
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_CONFIRMATION",
    }));
    mock.method(attendanceNotificationRepository, "markSent", async () => {
      throw new Error("markSent failed");
    });
    const recoveryMock = mock.method(
      attendanceNotificationRepository,
      "markSentRecoveryRequired",
      async () => undefined,
    );
    mock.method(attendanceNotificationRepository, "reconcileSentRecoveryRequired", async () => 0);
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationSent, 1);
    assert.equal(recoveryMock.mock.callCount(), 1);
    assert.equal(markFailedMock.mock.callCount(), 0);
    const recoveryInput = recoveryMock.mock.calls[0]?.arguments[1] as {
      twilioMessageSid: string;
    };
    assert.equal(recoveryInput.twilioMessageSid, "SM_CONFIRMATION");
  });

  it("defers confirmation send on ACTIVE_SESSION_CONFLICT without claiming physical attendance", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () => ({
      status: "ACTIVE_SESSION_CONFLICT" as const,
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_CONFIRMATION",
    }));
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationSent, 0);
    assert.equal(summary.confirmationFailed, 1);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markFailedMock.mock.callCount(), 1);
    assert.equal(markSupersededMock.mock.callCount(), 0);
    const failedInput = markFailedMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(failedInput.errorMessage, CONFIRMATION_BLOCKED_BY_ACTIVE_SESSION_CONFLICT);
    assert.notEqual(
      failedInput.errorMessage,
      CONFIRMATION_BLOCKED_BY_ACTIVE_ATTENDANCE_SESSION,
    );
  });

  it("cancels prepared session and marks failed when Twilio send fails", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () =>
      createdConfirmationSessionResult,
    );
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      throw new Error("Twilio unavailable");
    });
    const cancelMock = mock.method(botSessionService, "cancelSession", async () => undefined);
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );
    const markSentMock = mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationFailed, 1);
    assert.equal(cancelMock.mock.callCount(), 1);
    assert.equal(markFailedMock.mock.callCount(), 1);
    assert.equal(markSentMock.mock.callCount(), 0);
  });

  it("claims confirmation reminders using schedule_version for idempotent cycles", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 2,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    const claimMock = mock.method(
      attendanceNotificationRepository,
      "claimNotificationForAttempt",
      async () => ({
        ...claimedNotification,
        notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
      }),
    );
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () =>
      createdConfirmationSessionResult,
    );
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_CONFIRMATION_V2",
    }));
    mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    await attendanceReminderService.runDueReminders(COMPANY_ID);

    const claimInput = claimMock.mock.calls[0]?.arguments[1] as {
      scheduleVersion: number;
      notificationType: string;
    };
    assert.equal(claimInput.notificationType, "ATTENDANCE_CONFIRMATION_REMINDER");
    assert.equal(claimInput.scheduleVersion, 2);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  it("marks failed when cancelSession throws after Twilio failure", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "reconcileSentRecoveryRequired", async () => 0);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () =>
      createdConfirmationSessionResult,
    );
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      throw new Error("Twilio unavailable");
    });
    mock.method(botSessionService, "cancelSession", async () => {
      throw new Error("cleanup failed");
    });
    const markFailedMock = mock.method(
      attendanceNotificationRepository,
      "markFailed",
      async () => undefined,
    );

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationFailed, 1);
    assert.equal(markFailedMock.mock.callCount(), 1);
    const failedInput = markFailedMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(failedInput.errorMessage, "Twilio unavailable");
  });

  it("continues processing remaining candidates when one throws unexpectedly", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    const candidateB = {
      ...candidate,
      employeeId: "55555555-5555-5555-5555-555555555555",
      employeeName: "Bruno",
    };

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => [
      candidate,
      candidateB,
    ]);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "reconcileSentRecoveryRequired", async () => 0);

    let claimCount = 0;
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => {
      claimCount += 1;
      if (claimCount === 1) {
        throw new Error("unexpected claim failure");
      }
      return {
        ...claimedNotification,
        employeeId: candidateB.employeeId,
        notificationType: "ARRIVAL_REMINDER_15_MIN" as const,
      };
    });
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_ARRIVAL_B",
    }));
    mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.arrivalFailed, 1);
    assert.equal(summary.arrivalSent, 1);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  it("reports ONE_TIME vs RECURRING candidate counts in the run summary", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => [
      candidate,
      {
        ...candidate,
        employeeId: "55555555-5555-5555-5555-555555555555",
        operationKind: "RECURRING",
        employeeWorkdayId: "88888888-8888-8888-8888-888888888888",
      },
    ]);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => null);
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_UNUSED",
    }));

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.arrivalCandidates, 2);
    assert.deepEqual(summary.arrivalCandidatesByKind, { ONE_TIME: 1, RECURRING: 1, OTHER: 0 });
  });

  it("TOCTOU: check-in committed after early gate blocks Twilio via final revalidation", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const {
      attendanceReminderService,
      __setConfirmationReminderPreSendBarrierForTests,
    } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    let checkedIn = false;
    let gateCalls = 0;
    const paused = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve: () => resolve() };
    })();
    const checkInCommitted = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      return { promise, resolve: () => resolve() };
    })();

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => {
      gateCalls += 1;
      return checkedIn ? "ALREADY_CHECKED_IN" : "ELIGIBLE";
    });
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () =>
      createdConfirmationSessionResult,
    );
    const cancelMock = mock.method(botSessionService, "cancelSession", async () => undefined);
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_SHOULD_NOT_SEND",
    }));
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );
    mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    __setConfirmationReminderPreSendBarrierForTests(async () => {
      paused.resolve();
      await checkInCommitted.promise;
    });

    const reminderPromise = attendanceReminderService.runDueReminders(COMPANY_ID);
    await paused.promise;
    assert.equal(gateCalls, 1, "early gate should have run before barrier");
    assert.equal(sendMock.mock.callCount(), 0);

    // Concurrent check-in commits while reminder is paused after session prep.
    checkedIn = true;
    checkInCommitted.resolve();

    const summary = await reminderPromise;

    assert.equal(summary.confirmationSent, 0);
    assert.equal(summary.confirmationSkipped, 1);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.ok(gateCalls >= 2, "final pre-send gate must revalidate");
    assert.equal(cancelMock.mock.callCount(), 1);
    const supersededInput = markSupersededMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(supersededInput.errorMessage, NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_ALREADY_CHECKED_IN);
    assert.equal(WHATSAPP_RESULT_CODES.REMINDER_SKIPPED_ALREADY_CHECKED_IN, "REMINDER_SKIPPED_ALREADY_CHECKED_IN");
  });

  it("ACTIVE_SESSION_CONFLICT is retryable: next run can claim and send after conflict clears", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    let conflictActive = true;
    let claimCalls = 0;

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => {
      claimCalls += 1;
      return {
        ...claimedNotification,
        id: claimedNotification.id,
        notificationType: "ATTENDANCE_CONFIRMATION_REMINDER" as const,
        status: "PENDING" as const,
        attemptCount: claimCalls,
      };
    });
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () => {
      if (conflictActive) {
        return { status: "ACTIVE_SESSION_CONFLICT" as const };
      }
      return createdConfirmationSessionResult;
    });
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_RETRY_OK",
    }));
    mock.method(attendanceNotificationRepository, "markFailed", async () => undefined);
    mock.method(attendanceNotificationRepository, "markSent", async () => undefined);

    const first = await attendanceReminderService.runDueReminders(COMPANY_ID);
    assert.equal(first.confirmationFailed, 1);
    assert.equal(first.confirmationSent, 0);
    assert.equal(sendMock.mock.callCount(), 0);

    conflictActive = false;
    const second = await attendanceReminderService.runDueReminders(COMPANY_ID);
    assert.equal(second.confirmationSent, 1);
    assert.equal(second.confirmationFailed, 0);
    assert.equal(sendMock.mock.callCount(), 1);
    assert.equal(claimCalls, 2);
  });

  it("ACTIVE_SESSION_CONFLICT stops retrying once ATTENDANCE_REMINDER_MAX_ATTEMPTS is exhausted", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const { attendanceReminderService } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    let claimCalls = 0;
    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => "ELIGIBLE");
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => {
      claimCalls += 1;
      // Mirrors reclaim: FAILED rows with attempt_count >= maxAttempts are not reclaimable.
      if (claimCalls > ATTENDANCE_REMINDER_MAX_ATTEMPTS) {
        return null;
      }
      return {
        ...claimedNotification,
        notificationType: "ATTENDANCE_CONFIRMATION_REMINDER" as const,
        attemptCount: claimCalls,
      };
    });
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () => ({
      status: "ACTIVE_SESSION_CONFLICT" as const,
    }));
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_SHOULD_NOT",
    }));
    mock.method(attendanceNotificationRepository, "markFailed", async () => undefined);

    for (let i = 0; i < ATTENDANCE_REMINDER_MAX_ATTEMPTS; i += 1) {
      const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);
      assert.equal(summary.confirmationFailed, 1);
      assert.equal(summary.confirmationSent, 0);
    }

    const exhausted = await attendanceReminderService.runDueReminders(COMPANY_ID);
    assert.equal(exhausted.confirmationFailed, 0);
    assert.equal(exhausted.confirmationSkipped, 1);
    assert.equal(exhausted.confirmationSent, 0);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(claimCalls, ATTENDANCE_REMINDER_MAX_ATTEMPTS + 1);
  });

  it("finalGate ALREADY_CHECKED_IN records skip observability without TWILIO_SEND FAILED", async () => {
    const { env } = await import("../config/env");
    configureTwilioEnv(env);

    const { attendanceNotificationRepository } = await import(
      "../repositories/attendance-notification.repository"
    );
    const {
      attendanceReminderService,
      __setConfirmationReminderPreSendBarrierForTests,
    } = await import("./attendance-reminder.service");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { botSessionService } = await import("./bot-session.service");
    const { whatsappFlowTraceService } = await import("./whatsapp-flow-trace.service");

    const confirmationCandidate = {
      ...candidate,
      scheduleVersion: 1,
      confirmationReminderHoursBefore: 24,
    };

    const steps: Array<{ stepType: string; status: string }> = [];
    const completes: Array<{ status?: string; resultCode?: string | null }> = [];

    mock.method(attendanceNotificationRepository, "findArrivalReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findExitReminderCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findNoCheckInAtStartCandidates", async () => []);
    mock.method(attendanceNotificationRepository, "findConfirmationReminderCandidates", async () => [
      confirmationCandidate,
    ]);
    mock.method(attendanceNotificationRepository, "claimNotificationForAttempt", async () => ({
      ...claimedNotification,
      notificationType: "ATTENDANCE_CONFIRMATION_REMINDER",
    }));
    let gateCalls = 0;
    mock.method(attendanceNotificationRepository, "getConfirmationReminderSendGate", async () => {
      gateCalls += 1;
      return gateCalls === 1 ? "ELIGIBLE" : "ALREADY_CHECKED_IN";
    });
    mock.method(botSessionService, "createAttendanceConfirmationResponseSession", async () =>
      createdConfirmationSessionResult,
    );
    mock.method(botSessionService, "cancelSession", async () => undefined);
    const sendMock = mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => ({
      messageSid: "SM_SHOULD_NOT",
    }));
    const markSupersededMock = mock.method(
      attendanceNotificationRepository,
      "markSuperseded",
      async () => undefined,
    );
    mock.method(whatsappFlowTraceService, "resolveOrCreateConversation", async () => ({
      id: "conv-1",
    }));
    mock.method(whatsappFlowTraceService, "startExecution", async () => ({
      executionId: "exec-1",
      correlationId: "corr-1",
      conversationId: "conv-1",
      addStep: async (input: { stepType: string; status: string }) => {
        steps.push({ stepType: input.stepType, status: input.status });
      },
      addCandidate: async () => undefined,
      addCandidates: async () => undefined,
      complete: async (input: { status?: string; resultCode?: string | null }) => {
        completes.push(input);
      },
    }));

    __setConfirmationReminderPreSendBarrierForTests(null);

    const summary = await attendanceReminderService.runDueReminders(COMPANY_ID);

    assert.equal(summary.confirmationSkipped, 1);
    assert.equal(sendMock.mock.callCount(), 0);
    assert.equal(markSupersededMock.mock.callCount(), 1);
    const supersededInput = markSupersededMock.mock.calls[0]?.arguments[1] as { errorMessage: string };
    assert.equal(supersededInput.errorMessage, NO_LONGER_ELIGIBLE_FOR_CONFIRMATION_ALREADY_CHECKED_IN);

    assert.equal(
      steps.some((s) => s.stepType === "TWILIO_SEND" && s.status === "FAILED"),
      false,
      "must not record fictitious Twilio provider failure",
    );
    assert.ok(steps.some((s) => s.stepType === "FLOW_COMPLETED" && s.status === "SKIPPED"));
    assert.equal(completes.length, 1);
    assert.equal(completes[0]?.status, "COMPLETED");
    assert.equal(completes[0]?.resultCode, WHATSAPP_RESULT_CODES.REMINDER_SKIPPED_ALREADY_CHECKED_IN);
  });
});
