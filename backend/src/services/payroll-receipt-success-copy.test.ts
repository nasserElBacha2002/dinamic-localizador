import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { WHATSAPP_RESULT_CODES } from "../constants/whatsapp-observability";
import type { BotSession } from "../types/twilio.types";
import type {
  WhatsAppRouterContext,
  WhatsAppRouterHandlers,
} from "./whatsapp-router/whatsapp-router.types";

setupUnitTestEnv();

const baseSession = {
  id: "session-1",
  companyId: "company-1",
  employeeId: "employee-1",
  phoneNumber: "+5491100000000",
  state: "WAITING_PAYROLL_RECEIPT_PERIOD",
  contextJson: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as BotSession;

const baseCtx = {
  companyId: "company-1",
  employeeId: "employee-1",
  payload: {
    MessageSid: "SM_TEST",
    From: "whatsapp:+5491100000000",
    To: "whatsapp:+10000000000",
  },
  messageType: "TEXT" as const,
  phoneFrom: "+5491100000000",
  phoneTo: "+10000000000",
  moduleStates: new Map([[COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS, true]]),
  session: baseSession,
  recentlyExpired: false,
  body: "07/26",
} as WhatsAppRouterContext;

describe("payroll receipt WhatsApp success copy", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("on completed delivery: sends empty TwiML confirmation (no Listo / Te enviamos)", async () => {
    const { botSessionService } = await import("./bot-session.service");
    const { payrollReceiptPeriodQueryService } = await import(
      "./payroll-receipt-period-query.service"
    );
    const { handleActivePayrollReceiptSession } = await import(
      "./whatsapp-router/payroll-receipt.handler"
    );

    mock.method(botSessionService, "completeSession", async () => undefined);
    mock.method(payrollReceiptPeriodQueryService, "deliverForPeriod", async () => ({
      kind: "completed" as const,
      message: "SHOULD_NOT_BE_SHOWN",
      deliveredCount: 2,
      totalCount: 2,
      introSent: false,
    }));

    let respondedMessage: string | null = null;
    let resultCode: string | undefined;
    const handlers = {
      respond: async (_companyId: string, input: { message: string; resultCode?: string }) => {
        respondedMessage = input.message;
        resultCode = input.resultCode;
        return input.message.trim()
          ? `<Response><Message>${input.message}</Message></Response>`
          : "<Response></Response>";
      },
    } as unknown as WhatsAppRouterHandlers;

    const twiml = await handleActivePayrollReceiptSession(baseCtx, baseSession, handlers);
    assert.equal(respondedMessage, "");
    assert.equal(resultCode, WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_SEND_ACCEPTED);
    assert.ok(twiml);
    assert.doesNotMatch(twiml, /Listo/i);
    assert.doesNotMatch(twiml, /Te enviamos/i);
    assert.doesNotMatch(twiml, /ya se enviaron/i);
    assert.doesNotMatch(twiml, /<Message>/);
  });

  it("on not_found: keeps functional message", async () => {
    const { botSessionService } = await import("./bot-session.service");
    const { payrollReceiptPeriodQueryService } = await import(
      "./payroll-receipt-period-query.service"
    );
    const { handleActivePayrollReceiptSession } = await import(
      "./whatsapp-router/payroll-receipt.handler"
    );

    mock.method(botSessionService, "completeSession", async () => undefined);
    mock.method(payrollReceiptPeriodQueryService, "deliverForPeriod", async () => ({
      kind: "not_found" as const,
      message: "No encontramos recibos de sueldo para el período 07/26.",
      introSent: false,
    }));

    let respondedMessage: string | null = null;
    const handlers = {
      respond: async (_companyId: string, input: { message: string }) => {
        respondedMessage = input.message;
        return `<Response><Message>${input.message}</Message></Response>`;
      },
    } as unknown as WhatsAppRouterHandlers;

    await handleActivePayrollReceiptSession(baseCtx, baseSession, handlers);
    assert.match(respondedMessage ?? "", /No encontramos recibos/);
  });

  it("on invalid period: keeps validation message", async () => {
    const { handleActivePayrollReceiptSession } = await import(
      "./whatsapp-router/payroll-receipt.handler"
    );

    let respondedMessage: string | null = null;
    const handlers = {
      respond: async (_companyId: string, input: { message: string }) => {
        respondedMessage = input.message;
        return `<Response><Message>${input.message}</Message></Response>`;
      },
    } as unknown as WhatsAppRouterHandlers;

    await handleActivePayrollReceiptSession(
      { ...baseCtx, body: "no-es-periodo" },
      baseSession,
      handlers,
    );
    assert.match(respondedMessage ?? "", /período no es válido/i);
  });
});
