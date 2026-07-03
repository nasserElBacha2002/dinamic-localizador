import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const companyA = "11111111-1111-1111-1111-111111111111";
const companyB = "22222222-2222-2222-2222-222222222222";
const employeeA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const phone = "+5491111111111";

const nonConfiguredBotNumber = "whatsapp:+5491999999999";

const buildEmployee = (companyId: string, id: string) => ({
  id,
  companyId,
  name: "Test Employee",
  documentNumber: null,
  phoneNumber: phone,
  employeeType: "FIELD" as const,
  active: true,
  lastWorkedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const buildSession = (companyId: string, employeeId: string) => ({
  id: "session-1",
  companyId,
  employeeId,
  inventoryId: null,
  phoneNumber: phone,
  state: "WAITING_LOCATION" as const,
  contextJson: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("whatsappCompanyContextService", () => {
  afterEach(() => {
    mock.restoreAll();
    delete process.env.BOT_DEFAULT_COMPANY_ID;
    delete process.env.BOT_DEFAULT_COMPANY_NAME;
  });

  it("prefers an active session company over default company fallback", async () => {
    setupUnitTestEnv();
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { companyRepository } = await import("../repositories/company.repository");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");

    mock.method(botSessionRepository, "findValidActiveByPhoneGlobal", async () =>
      buildSession(companyB, employeeA),
    );
    mock.method(employeeRepository, "findById", async () => buildEmployee(companyB, employeeA));
    mock.method(companyRepository, "listActive", async () => [
      { id: companyA, name: "A", status: "ACTIVE" },
      { id: companyB, name: "B", status: "ACTIVE" },
    ]);

    const resolution = await whatsappCompanyContextService.resolve({
      phoneFrom: `whatsapp:${phone}`,
      phoneTo: nonConfiguredBotNumber,
      messageSid: "SM1",
    });

    assert.equal(resolution.kind, "resolved");
    if (resolution.kind === "resolved") {
      assert.equal(resolution.context.companyId, companyB);
      assert.equal(resolution.context.resolutionSource, "active_session");
      assert.equal(resolution.context.employeeId, employeeA);
    }
  });

  it("resolves a unique employee phone match within one company", async () => {
    setupUnitTestEnv();
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");

    mock.method(botSessionRepository, "findValidActiveByPhoneGlobal", async () => null);
    mock.method(employeeRepository, "listActiveByPhone", async () => [
      buildEmployee(companyA, employeeA),
    ]);
    mock.method(botSessionRepository, "findValidActiveByPhone", async () => null);

    const resolution = await whatsappCompanyContextService.resolve({
      phoneFrom: phone,
      phoneTo: nonConfiguredBotNumber,
      messageSid: "SM2",
    });

    assert.equal(resolution.kind, "resolved");
    if (resolution.kind === "resolved") {
      assert.equal(resolution.context.companyId, companyA);
      assert.equal(resolution.context.resolutionSource, "employee_phone_unique_match");
      assert.equal(resolution.context.employeeId, employeeA);
    }
  });

  it("blocks when the same phone belongs to multiple companies", async () => {
    setupUnitTestEnv();
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");

    mock.method(botSessionRepository, "findValidActiveByPhoneGlobal", async () => null);
    mock.method(employeeRepository, "listActiveByPhone", async () => [
      buildEmployee(companyA, employeeA),
      buildEmployee(companyB, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ]);

    const resolution = await whatsappCompanyContextService.resolve({
      phoneFrom: phone,
      phoneTo: nonConfiguredBotNumber,
      messageSid: "SM3",
    });

    assert.equal(resolution.kind, "blocked");
    if (resolution.kind === "blocked") {
      assert.equal(resolution.reason, "ambiguous_company");
    }
  });

  it("uses default company fallback only when no safer match exists", async () => {
    setupUnitTestEnv();
    process.env.BOT_DEFAULT_COMPANY_ID = companyA;
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { companyRepository } = await import("../repositories/company.repository");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");

    mock.method(botSessionRepository, "findValidActiveByPhoneGlobal", async () => null);
    mock.method(employeeRepository, "listActiveByPhone", async () => []);
    mock.method(companyRepository, "listActive", async () => [
      { id: companyA, name: "A", status: "ACTIVE" },
      { id: companyB, name: "B", status: "ACTIVE" },
    ]);
    mock.method(employeeRepository, "findByPhone", async () => null);
    mock.method(botSessionRepository, "findValidActiveByPhone", async () => null);

    const resolution = await whatsappCompanyContextService.resolve({
      phoneFrom: phone,
      phoneTo: nonConfiguredBotNumber,
      messageSid: "SM4",
    });

    assert.equal(resolution.kind, "resolved");
    if (resolution.kind === "resolved") {
      assert.equal(resolution.context.companyId, companyA);
      assert.equal(resolution.context.resolutionSource, "default_company_fallback");
      assert.equal(resolution.context.employeeId, null);
    }
  });

  it("blocks when company context cannot be resolved safely", async () => {
    setupUnitTestEnv();
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { companyRepository } = await import("../repositories/company.repository");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");

    mock.method(botSessionRepository, "findValidActiveByPhoneGlobal", async () => null);
    mock.method(employeeRepository, "listActiveByPhone", async () => []);
    mock.method(companyRepository, "listActive", async () => [
      { id: companyA, name: "A", status: "ACTIVE" },
      { id: companyB, name: "B", status: "ACTIVE" },
    ]);

    const resolution = await whatsappCompanyContextService.resolve({
      phoneFrom: phone,
      phoneTo: nonConfiguredBotNumber,
      messageSid: "SM5",
    });

    assert.equal(resolution.kind, "blocked");
    if (resolution.kind === "blocked") {
      assert.equal(resolution.reason, "company_unavailable");
    }
  });

  it("uses forced company in simulation without global ambiguity checks", async () => {
    setupUnitTestEnv();
    const { botSessionRepository } = await import("../repositories/bot-session.repository");
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { whatsappCompanyContextService } = await import("./whatsapp-company-context.service");
    const { runWithBotRuntimeContext } = await import("../utils/bot-runtime-context");

    mock.method(botSessionRepository, "findValidActiveByPhoneGlobal", async () => null);
    mock.method(botSessionRepository, "findValidActiveByPhone", async () => null);
    mock.method(employeeRepository, "findByPhone", async () => buildEmployee(companyA, employeeA));

    await runWithBotRuntimeContext(
      {
        simulationSessionId: "sim-1",
        employeeIdOverride: employeeA,
        phoneNumber: phone,
        simulatedNow: new Date(),
        mode: "dry-run",
        skipWhatsAppPersistence: true,
        messages: [],
        technicalDetails: {},
        simulationArtifacts: [],
        virtualAttendanceRecords: [],
        lastBotResponse: null,
        lastDetectedIntent: null,
        lastTwilioPayload: null,
      },
      async () => {
        const resolution = await whatsappCompanyContextService.resolve({
          phoneFrom: phone,
          phoneTo: nonConfiguredBotNumber,
          messageSid: "SM6",
          forcedCompanyId: companyA,
        });

        assert.equal(resolution.kind, "resolved");
        if (resolution.kind === "resolved") {
          assert.equal(resolution.context.companyId, companyA);
          assert.equal(resolution.context.resolutionSource, "simulation_forced_company");
          assert.equal(resolution.context.employeeId, employeeA);
        }
      },
    );
  });
});
