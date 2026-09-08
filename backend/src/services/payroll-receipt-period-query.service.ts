import { env } from "../config/env";
import { formatPayrollReceiptPeriod } from "../utils/payroll-receipts/period-format";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { payrollReceiptQueryDeliveryRepository } from "../repositories/payroll-receipt-query-delivery.repository";
import { payrollReceiptWhatsappDeliveryService } from "./payroll-receipt-whatsapp-delivery.service";
import { resolveBotSessionScope } from "../utils/bot-session-scope";
import { normalizePhoneNumber } from "../utils/phone";

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
  }): Promise<PayrollReceiptPeriodQueryResult> {
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

      const claim = await payrollReceiptQueryDeliveryRepository.claimForSend({
        ...queryKey,
        payrollReceiptId: receipt.id,
        leaseMs: env.PAYROLL_RECEIPT_QUERY_DELIVERY_LEASE_MS,
      });
      if (!claim) {
        console.info("[payroll-receipt-query] delivery claim not acquired", {
          companyId: input.companyId,
          botSessionId: input.botSessionId,
          payrollReceiptId: receipt.id,
          observedStatus: existing?.status ?? null,
        });
        if (
          existing?.status === "SEND_STARTED" ||
          existing?.status === "RECONCILIATION_REQUIRED"
        ) {
          sawPermanentFailure = true;
        } else {
          sawTemporaryFailure = true;
        }
        continue;
      }

      const authorizedReceipt = await payrollReceiptRepository.findAuthorizedActiveAssociatedForSend({
        companyId: input.companyId,
        employeeId: input.employeeId,
        botSessionId: input.botSessionId,
        payrollReceiptId: receipt.id,
        phoneNumber: normalizePhoneNumber(input.toPhoneNumber),
        year: input.year,
        month: input.month,
        scope: resolveBotSessionScope(),
      });
      if (!authorizedReceipt) {
        console.warn("[payroll-receipt-query] authorization revoked before send", {
          companyId: input.companyId,
          botSessionId: input.botSessionId,
          payrollReceiptId: receipt.id,
        });
        await payrollReceiptQueryDeliveryRepository.markFailedBeforeSend({
          ...queryKey,
          payrollReceiptId: receipt.id,
          processingToken: claim.processingToken,
          processingVersion: claim.processingVersion,
          errorCode: "AUTHORIZATION_REVOKED",
          errorMessage: "Authorization changed before document send.",
        });
        sawPermanentFailure = true;
        continue;
      }

      let sendStarted = false;
      const delivery = await payrollReceiptWhatsappDeliveryService.deliverReceipt({
        toPhoneNumber: input.toPhoneNumber,
        receipt: authorizedReceipt,
        companyId: input.companyId,
        employeeId: input.employeeId,
        inboundMessageSid: input.inboundMessageSid ?? null,
        payrollReceiptId: receipt.id,
        onSendStarted: async () => {
          const marked = await payrollReceiptQueryDeliveryRepository.markSendStarted({
            ...queryKey,
            payrollReceiptId: receipt.id,
            processingToken: claim.processingToken,
            processingVersion: claim.processingVersion,
          });
          if (!marked) {
            throw new Error("PAYROLL_QUERY_DELIVERY_CLAIM_LOST");
          }
          sendStarted = true;
        },
      });

      if (delivery.kind === "send_accepted" || delivery.kind === "text_only") {
        let accepted = false;
        try {
          accepted = await payrollReceiptQueryDeliveryRepository.markAccepted({
            ...queryKey,
            payrollReceiptId: receipt.id,
            processingToken: claim.processingToken,
            processingVersion: claim.processingVersion,
            providerMessageSid:
              delivery.kind === "send_accepted" ? delivery.messageSid : null,
          });
        } catch (error) {
          console.error("[payroll-receipt-query] accepted send ledger update failed", {
            companyId: input.companyId,
            botSessionId: input.botSessionId,
            payrollReceiptId: receipt.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (accepted) {
          deliveredCount += 1;
        } else {
          console.error("[payroll-receipt-query] accepted send requires reconciliation", {
            companyId: input.companyId,
            botSessionId: input.botSessionId,
            payrollReceiptId: receipt.id,
          });
          await payrollReceiptQueryDeliveryRepository.markReconciliationRequired({
            ...queryKey,
            payrollReceiptId: receipt.id,
            processingToken: claim.processingToken,
            processingVersion: claim.processingVersion,
            providerMessageSid:
              delivery.kind === "send_accepted" ? delivery.messageSid : null,
            errorCode: "ACCEPTANCE_PERSIST_FAILED",
            errorMessage: "Provider accepted the send but the ledger could not be finalized.",
          });
          sawPermanentFailure = true;
        }
        continue;
      }

      if (sendStarted) {
        console.warn("[payroll-receipt-query] ambiguous send requires reconciliation", {
          companyId: input.companyId,
          botSessionId: input.botSessionId,
          payrollReceiptId: receipt.id,
          errorCode: delivery.kind,
        });
        await payrollReceiptQueryDeliveryRepository.markReconciliationRequired({
          ...queryKey,
          payrollReceiptId: receipt.id,
          processingToken: claim.processingToken,
          processingVersion: claim.processingVersion,
          errorCode: delivery.kind,
          errorMessage: delivery.message,
        });
      } else {
        await payrollReceiptQueryDeliveryRepository.markFailedBeforeSend({
          ...queryKey,
          payrollReceiptId: receipt.id,
          processingToken: claim.processingToken,
          processingVersion: claim.processingVersion,
          errorCode: delivery.kind,
          errorMessage: delivery.message,
        });
      }

      if (delivery.kind === "unavailable_temporary" && !sendStarted) {
        sawTemporaryFailure = true;
      } else {
        sawPermanentFailure = true;
      }
    }

    const finalDeliveries = await payrollReceiptQueryDeliveryRepository.listForQuery(queryKey);
    deliveredCount = finalDeliveries.filter((delivery) => delivery.status === "ACCEPTED").length;
    const totalCount = receipts.length;

    if (deliveredCount === totalCount) {
      return {
        kind: "completed",
        // No user-visible confirmation: documents already sent outbound.
        message: "",
        deliveredCount,
        totalCount,
      };
    }

    // Prefer temporary when any receipt can still be retried.
    if (sawTemporaryFailure) {
      return {
        kind: "partial_temporary",
        message: partialMessage(deliveredCount, totalCount, input.year, input.month),
        deliveredCount,
        totalCount,
      };
    }

    if (sawPermanentFailure && deliveredCount > 0) {
      return {
        kind: "partial_failed",
        message: partialMessage(deliveredCount, totalCount, input.year, input.month),
        deliveredCount,
        totalCount,
      };
    }

    return {
      kind: "failed",
      message: partialMessage(deliveredCount, totalCount, input.year, input.month),
      deliveredCount,
      totalCount,
    };
  },
};
