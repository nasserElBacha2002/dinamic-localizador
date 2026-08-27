import { mock } from "node:test";

/** Stub admin alert side effects for unit tests that touch emit hooks. */
export const mockAdminAlertSideEffects = async (): Promise<void> => {
  const { adminAlertContextRepository } = await import(
    "../repositories/admin-alert-context.repository"
  );
  const { employeeRepository } = await import("../repositories/employee.repository");
  const { adminAlertService } = await import("../services/admin-alert.service");
  const { adminAlertMissingCheckinService } = await import(
    "../services/admin-alert-missing-checkin.service"
  );

  mock.method(adminAlertContextRepository, "getAssignmentScheduleVersion", async () => 1);
  mock.method(employeeRepository, "findById", async () => ({
    id: "employee-test",
    companyId: "company-test",
    name: "Test Employee",
    phoneNumber: "+5491111111111",
    employeeType: "fijo",
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
  mock.method(adminAlertService, "emit", async () => ({
    enqueued: 0,
    dedupSkipped: 0,
    recipientSkipped: 0,
  }));
  mock.method(adminAlertMissingCheckinService, "emitForCompletedOperation", async () => undefined);
  mock.method(
    (await import("../services/admin-alert-absence-pending.service")).adminAlertAbsencePendingService,
    "emitForPendingWhatsappRequest",
    async () => undefined,
  );
};
