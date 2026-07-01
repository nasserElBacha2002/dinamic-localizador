import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("attendanceReminderService", () => {
  it("does not call Twilio when attempt claim returns null", async () => {
    setupUnitTestEnv();

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
      async () => ({
        inventoryId: "11111111-1111-1111-1111-111111111111",
        employeeId: "22222222-2222-2222-2222-222222222222",
        employeeName: "Ana",
        employeePhoneNumber: "+5491112345678",
        storeName: "Centro",
        scheduledStart: "2026-06-23T14:00:00.000Z",
        scheduledEnd: "2026-06-23T22:00:00.000Z",
      }),
    );

    const outcome = await attendanceReminderService.sendTestReminder(
      "11111111-1111-1111-1111-111111111111",
      {
        inventoryId: "11111111-1111-1111-1111-111111111111",
        employeeId: "22222222-2222-2222-2222-222222222222",
        notificationType: "ARRIVAL_REMINDER_15_MIN",
      },
    );

    assert.equal(outcome, "skipped");
    assert.equal(claimMock.mock.callCount(), 1);
    assert.equal(sendMock.mock.callCount(), 0);

    claimMock.mock.restore();
    sendMock.mock.restore();
    findCandidateMock.mock.restore();
  });
});
