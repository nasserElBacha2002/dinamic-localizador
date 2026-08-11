import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { botSessionService } from "../bot-session.service";
import { getPayrollReceiptsModuleBlockedMessage } from "../whatsapp-module-gate";
import { payrollReceiptPeriodQueryService } from "../payroll-receipt-period-query.service";
import { isGlobalCancelCommand } from "../../utils/intent";
import { parsePayrollReceiptPeriodMessage } from "../../utils/payroll-receipts/period-parser";
import { payrollReceiptMetrics } from "../../utils/payroll-receipts/metrics";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import { isPayrollReceiptSessionState } from "../../utils/bot-session-states";
import { logModuleBlocked } from "./module-session-gate";
import type { BotSession, BotSessionContext } from "../../types/twilio.types";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

const ASK_PERIOD_MESSAGE =
  'Indicá el período del recibo que querés consultar en formato MM/YY.\n\nPor ejemplo: 07/26\n\nSi querés cancelar, escribí "Cancelar".';

const INVALID_PERIOD_MESSAGE =
  "El período no es válido. Indicá mes y año en formato MM/YY, por ejemplo 07/26.";

const SAFE_ERROR_MESSAGE =
  "No pudimos consultar tu recibo en este momento. Intentá nuevamente más tarde.";

const parseSessionContext = (session: BotSession): BotSessionContext => {
  if (!session.contextJson) {
    return {};
  }
  try {
    return JSON.parse(session.contextJson) as BotSessionContext;
  } catch {
    return {};
  }
};

export const handlePayrollReceiptIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("payroll_receipt");
  const blockedMessage = getPayrollReceiptsModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "payroll_receipts");
    return handlers.respond(ctx.companyId, {
      message: blockedMessage,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  if (!ctx.employeeId) {
    return handlers.respond(ctx.companyId, {
      message: SAFE_ERROR_MESSAGE,
      employeeId: null,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  await botSessionService.createPayrollReceiptPeriodSession(ctx.companyId, {
    employeeId: ctx.employeeId,
    phoneNumber: ctx.phoneFrom,
  });

  return handlers.respond(ctx.companyId, {
    message: ASK_PERIOD_MESSAGE,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
    resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_PERIOD_REQUESTED,
    flowType: "PAYROLL_RECEIPT_QUERY",
  });
};

export const handleActivePayrollReceiptSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (!isPayrollReceiptSessionState(session.state)) {
    return null;
  }

  const blockedMessage = getPayrollReceiptsModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "payroll_receipts");
    await botSessionService.cancelSession(ctx.companyId, session.id);
    return handlers.respond(ctx.companyId, {
      message: blockedMessage,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  if (isGlobalCancelCommand(ctx.body)) {
    await botSessionService.cancelSession(ctx.companyId, session.id);
    return handlers.respond(ctx.companyId, {
      message: "Listo, cancelé la consulta del recibo.",
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_CANCELLED,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  payrollReceiptMetrics.queryReceived({ operation: "period_message" });

  const parsed = parsePayrollReceiptPeriodMessage(ctx.body);
  if (parsed.kind === "not_a_period" || parsed.kind === "invalid_month" || parsed.kind === "invalid_year") {
    payrollReceiptMetrics.queryInvalidPeriod({ status: parsed.kind });
    return handlers.respond(ctx.companyId, {
      message: INVALID_PERIOD_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  if (parsed.kind === "ambiguous") {
    payrollReceiptMetrics.queryInvalidPeriod({ status: "ambiguous" });
    return handlers.respond(ctx.companyId, {
      message: "El período no es válido. Indicá mes y año en formato MM/YY, por ejemplo 07/26.",
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  if (!ctx.employeeId) {
    await botSessionService.cancelSession(ctx.companyId, session.id);
    return handlers.respond(ctx.companyId, {
      message: SAFE_ERROR_MESSAGE,
      employeeId: null,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  const priorContext = parseSessionContext(session).payrollReceiptQuery;
  const samePeriodRetry =
    priorContext?.year === parsed.year && priorContext?.month === parsed.month;

  const result = await payrollReceiptPeriodQueryService.deliverForPeriod({
    companyId: ctx.companyId,
    employeeId: ctx.employeeId,
    botSessionId: session.id,
    toPhoneNumber: ctx.phoneFrom,
    year: parsed.year,
    month: parsed.month,
    inboundMessageSid: ctx.payload.MessageSid ?? null,
    introAlreadySent: Boolean(samePeriodRetry && priorContext?.introSent),
  });

  if (result.kind === "not_found") {
    payrollReceiptMetrics.queryNotFound({
      year: parsed.year,
      month: parsed.month,
    });
    await botSessionService.completeSession(ctx.companyId, session.id);
    return handlers.respond(ctx.companyId, {
      message: result.message,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_NOT_FOUND,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  if (result.kind === "partial_temporary" || result.kind === "partial_failed") {
    await botSessionService.updatePayrollReceiptSessionContext(ctx.companyId, session.id, {
      year: parsed.year,
      month: parsed.month,
      introSent: result.introSent,
    });
    payrollReceiptMetrics.queryFailed({ status: result.kind });
    return handlers.respond(ctx.companyId, {
      message: result.message,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_DELIVERY_UNAVAILABLE,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  if (result.kind === "failed") {
    await botSessionService.updatePayrollReceiptSessionContext(ctx.companyId, session.id, {
      year: parsed.year,
      month: parsed.month,
      introSent: result.introSent,
    });
    payrollReceiptMetrics.queryFailed({ status: "failed" });
    return handlers.respond(ctx.companyId, {
      message: result.message,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_DELIVERY_UNAVAILABLE,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  await botSessionService.completeSession(ctx.companyId, session.id);
  payrollReceiptMetrics.queryDelivered({ status: "multi_or_single" });

  return handlers.respond(ctx.companyId, {
    message: result.message,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
    resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_SEND_ACCEPTED,
    flowType: "PAYROLL_RECEIPT_QUERY",
  });
};
