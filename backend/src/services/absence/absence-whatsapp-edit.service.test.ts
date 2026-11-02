import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import type { BotSession } from "../../types/twilio.types";

const kindSession = (): BotSession =>
  ({
    id: "session-kind",
    companyId: "co-1",
    employeeId: "emp-1",
    operationId: null,
    employeeWorkdayId: null,
    attendanceRecordId: null,
    phoneNumber: "+5491111111111",
    state: "WAITING_ABSENCE_KIND_SELECTION",
    intent: "ABSENCE",
    contextJson: JSON.stringify({
      flow: "ABSENCE_REQUEST",
      absenceKindOptions: ["single_workday", "absence", "vacation", "edit_request"],
    }),
    failedAttempts: 0,
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    sessionVersion: 0,
    lastMessageSid: null,
  }) as BotSession;

describe("absenceWhatsappEditService.startEditFlow", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("does not throw when persisting the edit session fails", async () => {
    setupUnitTestEnv();
    const { absenceRequestRepository } = await import(
      "../../repositories/absence/absence-request.repository"
    );
    const { botSessionService } = await import("../bot/bot-session.service");
    const { absenceWhatsappEditService } = await import("./absence-whatsapp-edit.service");

    mock.method(absenceRequestRepository, "listEmployeeEditableRequests", async () => [
      {
        id: "req-1",
        absenceTypeName: "Vacaciones",
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        status: "PENDING" as const,
        reason: "viaje",
      },
    ]);
    mock.method(botSessionService, "updateAbsenceSession", async () => {
      throw new Error("The INSERT statement conflicted with the CHECK constraint CK_bot_sessions_state");
    });

    let message = "";
    const response = await absenceWhatsappEditService.startEditFlow("co-1", {
      employeeId: "emp-1",
      phoneFrom: "+5491111111111",
      phoneTo: "+10000000000",
      kindSelectionSession: kindSession(),
      respond: async (input) => {
        message = input.message;
        return input.message;
      },
    });

    assert.match(message, /No pude iniciar la modificación/);
    assert.equal(response, message);
  });

  it("reuses the kind-selection session when starting field-menu edit", async () => {
    setupUnitTestEnv();
    const { absenceRequestRepository } = await import(
      "../../repositories/absence/absence-request.repository"
    );
    const { botSessionService } = await import("../bot/bot-session.service");
    const { absenceWhatsappEditService } = await import("./absence-whatsapp-edit.service");

    mock.method(absenceRequestRepository, "listEmployeeEditableRequests", async () => [
      {
        id: "req-1",
        absenceTypeName: "Vacaciones",
        startDate: "2026-11-10",
        endDate: "2026-11-12",
        status: "PENDING" as const,
        reason: "viaje",
      },
    ]);
    let updatedState: string | null = null;
    mock.method(botSessionService, "updateAbsenceSession", async (_companyId, _id, input) => {
      updatedState = input.state;
      return { ...kindSession(), state: input.state, contextJson: input.contextJson };
    });
    mock.method(botSessionService, "createAbsenceSession", async () => {
      throw new Error("should reuse kind-selection session");
    });

    let message = "";
    await absenceWhatsappEditService.startEditFlow("co-1", {
      employeeId: "emp-1",
      phoneFrom: "+5491111111111",
      phoneTo: "+10000000000",
      kindSelectionSession: kindSession(),
      respond: async (input) => {
        message = input.message;
        return input.message;
      },
    });

    assert.equal(updatedState, "WAITING_ABSENCE_EDIT_FIELD_MENU");
    assert.match(message, /¿Qué querés modificar\?/);
    assert.match(message, /Desde: 10\/11\/2026/);
    assert.match(message, /Hasta: 12\/11\/2026/);
    assert.doesNotMatch(message, /undefined/);
  });

  it("lists several requests with Spanish dates and status", async () => {
    setupUnitTestEnv();
    const { absenceRequestRepository } = await import(
      "../../repositories/absence/absence-request.repository"
    );
    const { botSessionService } = await import("../bot/bot-session.service");
    const { absenceWhatsappEditService } = await import("./absence-whatsapp-edit.service");

    mock.method(absenceRequestRepository, "listEmployeeEditableRequests", async () => [
      {
        id: "req-1",
        absenceTypeName: "Vacaciones",
        startDate: "2026-11-05",
        endDate: "2026-11-09",
        status: "PENDING" as const,
        reason: "vacas",
      },
      {
        id: "req-2",
        absenceTypeName: "Enfermedad",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        status: "NEEDS_INFO" as const,
        reason: "",
      },
    ]);
    mock.method(botSessionService, "updateAbsenceSession", async (_companyId, _id, input) => {
      return { ...kindSession(), state: input.state, contextJson: input.contextJson };
    });

    let message = "";
    await absenceWhatsappEditService.startEditFlow("co-1", {
      employeeId: "emp-1",
      phoneFrom: "+5491111111111",
      phoneTo: "+10000000000",
      kindSelectionSession: kindSession(),
      respond: async (input) => {
        message = input.message;
        return input.message;
      },
    });

    assert.match(message, /05\/11\/2026 al 09\/11\/2026 — Pendiente de revisión/);
    assert.match(message, /01\/12\/2026 al 02\/12\/2026 — Requiere información/);
    assert.doesNotMatch(message, /undefined/);
    assert.doesNotMatch(message, /\bPENDING\b/);
  });
});
