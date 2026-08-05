import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { botSessionService } from "../bot-session.service";
import { getPayrollReceiptsModuleBlockedMessage } from "../whatsapp-module-gate";
import { payrollReceiptRepository } from "../../repositories/payroll-receipt.repository";
import { payrollReceiptWhatsappDeliveryService } from "../payroll-receipt-whatsapp-delivery.service";
import { isGlobalCancelCommand } from "../../utils/intent";
import { parsePayrollReceiptPeriodMessage } from "../../utils/payroll-receipts/period-parser";
import { formatPayrollReceiptPeriod } from "../../utils/payroll-receipts/period-format";
import { payrollReceiptMetrics } from "../../utils/payroll-receipts/metrics";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import { isPayrollReceiptSessionState } from "../../utils/bot-session-states";
import { logModuleBlocked } from "./module-session-gate";
import type { BotSession } from "../../types/twilio.types";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

const ASK_PERIOD_MESSAGE =
  'Indicá el período del recibo que querés consultar en formato MM/YY.\n\nPor ejemplo: 07/26\n\nSi querés cancelar, escribí "Cancelar".';

const INVALID_PERIOD_MESSAGE =
  "El período no es válido. Indicá mes y año en formato MM/YY, por ejemplo 07/26.";

const NOT_FOUND_MESSAGE = (year: number, month: number): string =>
  `No encontramos un recibo disponible para el período ${formatPayrollReceiptPeriod(year, month)}.`;

const SAFE_ERROR_MESSAGE =
  "No pudimos consultar tu recibo en este momento. Intentá nuevamente más tarde.";

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

  const receipt = await payrollReceiptRepository.findActiveAssociated(
    ctx.companyId,
    ctx.employeeId,
    parsed.year,
    parsed.month,
  );

  if (!receipt) {
    payrollReceiptMetrics.queryNotFound({
      year: parsed.year,
      month: parsed.month,
    });
    await botSessionService.completeSession(ctx.companyId, session.id);
    return handlers.respond(ctx.companyId, {
      message: NOT_FOUND_MESSAGE(parsed.year, parsed.month),
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_NOT_FOUND,
      flowType: "PAYROLL_RECEIPT_QUERY",
    });
  }

  const delivery = await payrollReceiptWhatsappDeliveryService.deliverReceipt({
    toPhoneNumber: ctx.phoneFrom,
    receipt,
  });

  await botSessionService.completeSession(ctx.companyId, session.id);

  const periodLabel = formatPayrollReceiptPeriod(parsed.year, parsed.month);
  // Prefer delivery.message so dry-run can explain that the PDF is not attached.
  const responseMessage =
    delivery.kind === "delivered"
      ? `Te enviamos tu recibo de sueldo correspondiente a ${periodLabel}.`
      : delivery.message;

  if (delivery.kind === "delivered" || delivery.kind === "text_only") {
    payrollReceiptMetrics.queryDelivered({ status: delivery.kind });
  } else {
    payrollReceiptMetrics.queryFailed({ status: delivery.kind });
  }

  return handlers.respond(ctx.companyId, {
    message: responseMessage,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
    resultCode:
      delivery.kind === "delivered"
        ? WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_DELIVERED
        : delivery.kind === "text_only"
          ? WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_DELIVERED
          : WHATSAPP_RESULT_CODES.PAYROLL_RECEIPT_DELIVERY_UNAVAILABLE,
    flowType: "PAYROLL_RECEIPT_QUERY",
  });
};
