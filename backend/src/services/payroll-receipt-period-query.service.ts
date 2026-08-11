import { formatPayrollReceiptPeriod } from "../utils/payroll-receipts/period-format";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { payrollReceiptQueryDeliveryRepository } from "../repositories/payroll-receipt-query-delivery.repository";
import { payrollReceiptWhatsappDeliveryService } from "./payroll-receipt-whatsapp-delivery.service";

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

const partialMessage = (deliveredCount: number, totalCount: number, year: number, month: number): string => {
  const period = formatPayrollReceiptPeriod(year, month);
  return (
    `Enviamos ${deliveredCount} de ${totalCount} recibos de ${period}. ` +
    "Algunos no se pudieron enviar ahora. Volvé a indicar el mismo período para reintentar solo los pendientes."
  );
};

/**
 * Delivers all ASSOCIATED receipts for a period.
 * Query identity = company + botSession + employee + year + month.
 * ACCEPTED means Twilio accepted outbound create (not a delivery callback).
 * Invariant: kind === "completed" iff deliveredCount === totalCount.
 *
 * On full success the PDFs are already sent via the Twilio REST API; the webhook
 * reply must not send an extra confirmation text.
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
    /** @deprecated Intro text before multi-receipt send was removed; ignored. */
    introAlreadySent?: boolean;
  }): Promise<PayrollReceiptPeriodQueryResult & { introSent: boolean }> {
    void input.introAlreadySent;
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
        // No user-visible confirmation: documents already sent outbound.
        message: "",
        deliveredCount,
        totalCount,
        introSent: false,
      };
    }

    // Prefer temporary when any receipt can still be retried.
    if (sawTemporaryFailure) {
      return {
        kind: "partial_temporary",
        message: partialMessage(deliveredCount, totalCount, input.year, input.month),
        deliveredCount,
        totalCount,
        introSent: false,
      };
    }

    if (sawPermanentFailure && deliveredCount > 0) {
      return {
        kind: "partial_failed",
        message: partialMessage(deliveredCount, totalCount, input.year, input.month),
        deliveredCount,
        totalCount,
        introSent: false,
      };
    }

    return {
      kind: "failed",
      message: partialMessage(deliveredCount, totalCount, input.year, input.month),
      deliveredCount,
      totalCount,
      introSent: false,
    };
  },
};
