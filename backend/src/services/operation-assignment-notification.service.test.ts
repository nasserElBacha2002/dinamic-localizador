import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const baseNotification = {
  id: "notif-1",
  companyId: "company-1",
  operationAssignmentId: "assignment-1",
  operationId: "operation-1",
  employeeId: "employee-1",
  notificationType: "EVENTUAL_OPERATION_ASSIGNED" as const,
  status: "PROCESSING" as const,
  attemptCount: 1,
  nextAttemptAt: null,
  leaseOwner: "operation-assignment-notif-1",
  leaseExpiresAt: new Date().toISOString(),
  providerMessageSid: null,
  providerStatus: null,
  cancelRequestedAt: null,
  activeSendAttemptId: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  sentAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const activeAssignment = {
  id: "assignment-1",
  companyId: "company-1",
  operationId: "operation-1",
  employeeId: "employee-1",
  validFrom: "2026-08-11",
  validUntil: "2026-08-11",
  assignedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  cancelledAt: null,
};

const oneTimeOperation = {
  id: "operation-1",
  serviceId: "service-1",
  operationKind: "ONE_TIME" as const,
  scheduledStart: "2026-08-11T15:00:00.000Z",
  scheduledEnd: "2026-08-11T19:00:00.000Z",
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  status: "SCHEDULED" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const activeEmployee = {
  id: "employee-1",
  companyId: "company-1",
  name: "Ana Pérez",
  documentNumber: null,
  phoneNumber: "+5491100000000",
  employeeType: "INTERNAL" as const,
  categoryId: null,
  category: null,
  locationZoneId: null,
  locationZone: null,
  active: true,
  lastWorkedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const service = {
  id: "service-1",
  name: "Obra Norte",
  address: "Calle 1",
  neighborhood: null,
  locality: "CABA",
  serviceFormat: null,
  latitude: 0,
  longitude: 0,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const stubCommonWorkerPrep = async () => {
  const { operationAssignmentNotificationRepository } = await import(
    "../repositories/operation-assignment-notification.repository"
  );
  mock.method(operationAssignmentNotificationRepository, "reconcileTerminalStates", async () => 0);
  mock.method(operationAssignmentNotificationRepository, "recoverExpiredLeases", async () => 0);
  mock.method(operationAssignmentNotificationRepository, "claimNextOne", async () => ({
    ...baseNotification,
    leaseOwner: `operation-assignment-notif-${process.pid}`,
  }));
  mock.method(operationAssignmentNotificationRepository, "isCancelRequested", async () => false);
  return operationAssignmentNotificationRepository;
};

describe("operationAssignmentNotificationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("CONFIG missing SID → permanent fail", async () => {
    const { env } = await import("../config/env");
    const previous = env.TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID;
    (env as { TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID?: string }).TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID =
      "";

    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    mock.method(operationEmployeeRepository, "findById", async () => activeAssignment);
    mock.method(operationRepository, "findById", async () => oneTimeOperation);
    mock.method(employeeRepository, "findById", async () => activeEmployee);
    mock.method(serviceRepository, "findById", async () => service);

    let failedCode: string | null = null;
    mock.method(repo, "markFailed", async (input: { errorCode: string; nextAttemptAt: Date | null }) => {
      failedCode = input.errorCode;
      assert.equal(input.nextAttemptAt, null);
    });

    try {
      const result = await operationAssignmentNotificationService.processPendingBatch(1);
      assert.equal(result.failed, 1);
      assert.equal(failedCode, "CONFIG");
    } finally {
      (env as { TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID?: string }).TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID =
        previous;
    }
  });

  it("MISSING_PHONE cancels without throwing", async () => {
    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    mock.method(operationEmployeeRepository, "findById", async () => activeAssignment);
    mock.method(operationRepository, "findById", async () => oneTimeOperation);
    mock.method(employeeRepository, "findById", async () => ({
      ...activeEmployee,
      phoneNumber: "   ",
    }));

    let cancelledCode: string | null = null;
    mock.method(repo, "markCancelled", async (input: { errorCode?: string }) => {
      cancelledCode = input.errorCode ?? null;
    });

    const result = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(result.cancelled, 1);
    assert.equal(cancelledCode, "MISSING_PHONE");
  });

  it("successful send uses content SID + template variables", async () => {
    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { whatsappMessageRepository } = await import("../repositories/whatsapp-message.repository");
    const { env } = await import("../config/env");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    mock.method(operationEmployeeRepository, "findById", async () => activeAssignment);
    mock.method(operationRepository, "findById", async () => oneTimeOperation);
    mock.method(employeeRepository, "findById", async () => activeEmployee);
    mock.method(serviceRepository, "findById", async () => service);

    mock.method(repo, "beginSendAttempt", async () => ({
      id: "attempt-1",
      companyId: "company-1",
      notificationId: "notif-1",
      attemptNumber: 1,
      status: "STARTED" as const,
      providerMessageSid: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let sendArgs: {
      contentSid: string;
      contentVariables: Record<string, string>;
      toPhoneNumber: string;
    } | null = null;
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async (args) => {
      sendArgs = args as typeof sendArgs;
      return { messageSid: "SM_TEST_ASSIGNMENT" };
    });
    mock.method(whatsappMessageRepository, "create", async () => ({ id: "msg-1" }));
    mock.method(repo, "markSendAttemptAccepted", async () => undefined);
    mock.method(repo, "markSendAccepted", async () => undefined);

    const result = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(result.sent, 1);
    assert.ok(sendArgs);
    assert.equal(sendArgs!.contentSid, env.TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID);
    assert.equal(sendArgs!.toPhoneNumber, activeEmployee.phoneNumber);
    assert.equal(sendArgs!.contentVariables["1"], "Ana");
    assert.match(sendArgs!.contentVariables["2"]!, /Obra Norte/);
    assert.match(sendArgs!.contentVariables["3"]!, /^\d{2}\/\d{2}\/\d{4}$/);
    assert.match(sendArgs!.contentVariables["4"]!, /^\d{2}:\d{2}$/);
  });

  it("ambiguous Twilio failure → reconciliation; claim again does not call Twilio", async () => {
    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    let claimCount = 0;
    mock.method(repo, "claimNextOne", async () => {
      claimCount += 1;
      if (claimCount === 1) {
        return {
          ...baseNotification,
          leaseOwner: `operation-assignment-notif-${process.pid}`,
        };
      }
      return null;
    });

    mock.method(operationEmployeeRepository, "findById", async () => activeAssignment);
    mock.method(operationRepository, "findById", async () => oneTimeOperation);
    mock.method(employeeRepository, "findById", async () => activeEmployee);
    mock.method(serviceRepository, "findById", async () => service);

    mock.method(repo, "beginSendAttempt", async () => ({
      id: "attempt-1",
      companyId: "company-1",
      notificationId: "notif-1",
      attemptNumber: 1,
      status: "STARTED" as const,
      providerMessageSid: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let twilioCalls = 0;
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      twilioCalls += 1;
      const err = new Error("socket hang up");
      (err as Error & { code: string }).code = "ECONNRESET";
      throw err;
    });

    let ambiguous = false;
    let reconciliation = false;
    mock.method(repo, "markSendAttemptAmbiguous", async () => {
      ambiguous = true;
    });
    mock.method(repo, "markReconciliationRequired", async () => {
      reconciliation = true;
    });

    const first = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(first.reconciliation, 1);
    assert.equal(ambiguous, true);
    assert.equal(reconciliation, true);
    assert.equal(twilioCalls, 1);

    const second = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(second.processed, 0);
    assert.equal(twilioCalls, 1);
  });

  it("ASSIGNMENT_OUT_OF_RANGE when validFrom is after operation work date", async () => {
    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    mock.method(operationEmployeeRepository, "findById", async () => ({
      ...activeAssignment,
      validFrom: "2026-08-12",
      validUntil: "2026-08-12",
    }));
    mock.method(operationRepository, "findById", async () => oneTimeOperation);

    let cancelledCode: string | null = null;
    mock.method(repo, "markCancelled", async (input: { errorCode?: string }) => {
      cancelledCode = input.errorCode ?? null;
    });

    const result = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(result.cancelled, 1);
    assert.equal(cancelledCode, "ASSIGNMENT_OUT_OF_RANGE");
  });

  it("ASSIGNMENT_OUT_OF_RANGE when validUntil is before operation work date", async () => {
    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    mock.method(operationEmployeeRepository, "findById", async () => ({
      ...activeAssignment,
      validFrom: "2026-08-01",
      validUntil: "2026-08-10",
    }));
    mock.method(operationRepository, "findById", async () => oneTimeOperation);

    let cancelledCode: string | null = null;
    mock.method(repo, "markCancelled", async (input: { errorCode?: string }) => {
      cancelledCode = input.errorCode ?? null;
    });

    const result = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(result.cancelled, 1);
    assert.equal(cancelledCode, "ASSIGNMENT_OUT_OF_RANGE");
  });

  it("DB failure after Twilio MessageSid → recovery, no second Twilio send", async () => {
    const repo = await stubCommonWorkerPrep();
    const { operationEmployeeRepository } = await import(
      "../repositories/operation-employee.repository"
    );
    const { operationRepository } = await import("../repositories/operation.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    const { whatsappMessageRepository } = await import("../repositories/whatsapp-message.repository");
    const { operationAssignmentNotificationService } = await import(
      "./operation-assignment-notification.service"
    );

    let claimCount = 0;
    mock.method(repo, "claimNextOne", async () => {
      claimCount += 1;
      if (claimCount === 1) {
        return {
          ...baseNotification,
          leaseOwner: `operation-assignment-notif-${process.pid}`,
        };
      }
      return null;
    });

    mock.method(operationEmployeeRepository, "findById", async () => activeAssignment);
    mock.method(operationRepository, "findById", async () => oneTimeOperation);
    mock.method(employeeRepository, "findById", async () => activeEmployee);
    mock.method(serviceRepository, "findById", async () => service);
    mock.method(repo, "beginSendAttempt", async () => ({
      id: "attempt-1",
      companyId: "company-1",
      notificationId: "notif-1",
      attemptNumber: 1,
      status: "STARTED" as const,
      providerMessageSid: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    let twilioCalls = 0;
    mock.method(twilioOutboundService, "sendWhatsAppTemplate", async () => {
      twilioCalls += 1;
      return { messageSid: "SM_AFTER_ACCEPT" };
    });
    mock.method(whatsappMessageRepository, "create", async () => {
      throw new Error("obs insert failed");
    });
    mock.method(repo, "markSendAttemptAccepted", async () => {
      throw new Error("attempt persist failed");
    });

    let recoverySid: string | null = null;
    mock.method(
      repo,
      "markSentRecoveryRequired",
      async (input: { providerMessageSid: string }) => {
        recoverySid = input.providerMessageSid;
      },
    );

    let classifiedRetry = false;
    mock.method(repo, "markFailed", async () => {
      classifiedRetry = true;
    });

    const result = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(result.recovery, 1);
    assert.equal(twilioCalls, 1);
    assert.equal(recoverySid, "SM_AFTER_ACCEPT");
    assert.equal(classifiedRetry, false);

    const second = await operationAssignmentNotificationService.processPendingBatch(1);
    assert.equal(second.processed, 0);
    assert.equal(twilioCalls, 1);
  });
});
