import { formatPayrollReceiptPeriod } from "../utils/payroll-receipts/period-format";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { payrollReceiptQueryDeliveryRepository } from "../repositories/payroll-receipt-query-delivery.repository";
import { payrollReceiptWhatsappDeliveryService } from "./payroll-receipt-whatsapp-delivery.service";
import { twilioOutboundService } from "./twilio-outbound.service";
import {
  isSimulationActive,
  recordSimulationArtifact,
} from "../utils/bot-runtime-context";

export type PayrollReceiptPeriodQueryResult =
  | {
      kind: "not_found";
      message: string;
    }
  | {
      kind: "completed";
      message: string;
      deliveredCount: number;
      totalCount: number;
    }
  | {
      kind: "partial_temporary";
      message: string;
      deliveredCount: number;
      totalCount: number;
    }
  | {
      kind: "partial_failed";
      message: string;
      deliveredCount: number;
      totalCount: number;
    }
  | {
      kind: "failed";
      message: string;
      deliveredCount: number;
      totalCount: number;
    };

const notFoundMessage = (year: number, month: number): string =>
  `No encontramos recibos de sueldo para el período ${formatPayrollReceiptPeriod(year, month)}.`;

const multiIntroMessage = (count: number, year: number, month: number): string =>
  `Encontramos ${count} recibos de sueldo correspondientes a ${formatPayrollReceiptPeriod(year, month)}. Te los envío a continuación.`;

const completedMessage = (deliveredCount: number, year: number, month: number): string => {
  const period = formatPayrollReceiptPeriod(year, month);
  if (deliveredCount <= 1) {
    return `Acá tenés tu recibo de sueldo del período ${period}.`;
  }
  return `Te enviamos ${deliveredCount} recibos de sueldo del período ${period}.`;
};

const partialMessage = (deliveredCount: number, totalCount: number, year: number, month: number): string => {
  const period = formatPayrollReceiptPeriod(year, month);
  return (
    `Enviamos ${deliveredCount} de ${totalCount} recibos de ${period}. ` +
    "Algunos no se pudieron enviar ahora. Volvé a indicar el mismo período para reintentar solo los pendientes."
  );
};

async function sendIntroIfNeeded(input: {
  toPhoneNumber: string;
  year: number;
  month: number;
  count: number;
  introAlreadySent: boolean;
}): Promise<boolean> {
  if (input.count <= 1 || input.introAlreadySent) {
    return input.introAlreadySent;
  }

  const body = multiIntroMessage(input.count, input.year, input.month);

  if (isSimulationActive()) {
    recordSimulationArtifact({
      type: "payroll_receipt_multi_intro",
      mode: "simulated",
      year: input.year,
      month: input.month,
      count: input.count,
      body,
    });
    return true;
  }

  await twilioOutboundService.sendWhatsAppText({
    toPhoneNumber: input.toPhoneNumber,
    body,
  });
  return true;
}

/**
 * Delivers all ASSOCIATED receipts for a period.
 * Query identity = company + botSession + employee + year + month.
 * ACCEPTED means Twilio accepted outbound create (not a delivery callback).
 * Invariant: kind === "completed" iff deliveredCount === totalCount.
 */
export const payrollReceiptPeriodQueryService = {
  async deliverForPeriod(input: {
    companyId: string;
    employeeId: string;
    botSessionId: string;
    toPhoneNumber: string;
    year: number;
    month: number;
    inboundMessageSid?: string | null;
    introAlreadySent?: boolean;
  }): Promise<PayrollReceiptPeriodQueryResult & { introSent: boolean }> {
    const receipts = await payrollReceiptRepository.listActiveAssociated(
      input.companyId,
      input.employeeId,
      input.year,
      input.month,
    );

    if (receipts.length === 0) {
      return {
        kind: "not_found",
        message: notFoundMessage(input.year, input.month),
        introSent: false,
      };
    }

    const queryKey = {
      companyId: input.companyId,
      botSessionId: input.botSessionId,
      employeeId: input.employeeId,
      year: input.year,
      month: input.month,
    };

    await payrollReceiptQueryDeliveryRepository.ensurePendingDeliveries({
      ...queryKey,
      payrollReceiptIds: receipts.map((r) => r.id),
    });

    const deliveries = await payrollReceiptQueryDeliveryRepository.listForQuery(queryKey);
    const deliveryByReceiptId = new Map(deliveries.map((d) => [d.payrollReceiptId, d]));

    const introSent = await sendIntroIfNeeded({
      toPhoneNumber: input.toPhoneNumber,
      year: input.year,
      month: input.month,
      count: receipts.length,
      introAlreadySent: Boolean(input.introAlreadySent),
    });

    let deliveredCount = deliveries.filter((d) => d.status === "ACCEPTED").length;
    let sawTemporaryFailure = false;
    let sawPermanentFailure = false;

    for (const receipt of receipts) {
      const existing = deliveryByReceiptId.get(receipt.id);
      if (existing?.status === "ACCEPTED") {
        continue;
      }

      const delivery = await payrollReceiptWhatsappDeliveryService.deliverReceipt({
        toPhoneNumber: input.toPhoneNumber,
        receipt,
        companyId: input.companyId,
        employeeId: input.employeeId,
        inboundMessageSid: input.inboundMessageSid ?? null,
        payrollReceiptId: receipt.id,
      });

      if (delivery.kind === "send_accepted" || delivery.kind === "text_only") {
        await payrollReceiptQueryDeliveryRepository.markAccepted({
          ...queryKey,
          payrollReceiptId: receipt.id,
          providerMessageSid: delivery.kind === "send_accepted" ? delivery.messageSid : null,
        });
        deliveredCount += 1;
        continue;
      }

      await payrollReceiptQueryDeliveryRepository.markFailed({
        ...queryKey,
        payrollReceiptId: receipt.id,
        errorCode: delivery.kind,
        errorMessage: delivery.message,
      });

      if (delivery.kind === "unavailable_temporary") {
        sawTemporaryFailure = true;
      } else {
        sawPermanentFailure = true;
      }
    }

    const totalCount = receipts.length;

    if (deliveredCount === totalCount) {
      return {
        kind: "completed",
        message: completedMessage(deliveredCount, input.year, input.month),
        deliveredCount,
        totalCount,
        introSent,
      };
    }

    // Prefer temporary when any receipt can still be retried.
    if (sawTemporaryFailure) {
      return {
        kind: "partial_temporary",
        message: partialMessage(deliveredCount, totalCount, input.year, input.month),
        deliveredCount,
        totalCount,
        introSent,
      };
    }

    if (sawPermanentFailure && deliveredCount > 0) {
      return {
        kind: "partial_failed",
        message: partialMessage(deliveredCount, totalCount, input.year, input.month),
        deliveredCount,
        totalCount,
        introSent,
      };
    }

    return {
      kind: "failed",
      message: partialMessage(deliveredCount, totalCount, input.year, input.month),
      deliveredCount,
      totalCount,
      introSent,
    };
  },
};
