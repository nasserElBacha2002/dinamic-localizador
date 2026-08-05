import { env } from "../config/env";
import { getAttachmentStorage } from "./attachment-storage";
import { formatPayrollReceiptPeriod } from "../utils/payroll-receipts/period-format";
import {
  isSimulationActive,
  recordSimulationArtifact,
  setTechnicalDetail,
} from "../utils/bot-runtime-context";
import { classifyTwilioOutboundError } from "../utils/twilio-error-classifier";
import { twilioOutboundService } from "./twilio-outbound.service";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { PayrollReceipt } from "../types/payroll-receipt";

export type PayrollReceiptDeliveryResult =
  | { kind: "send_accepted"; message: string; messageSid?: string }
  | { kind: "text_only"; message: string }
  | { kind: "unavailable_permanent"; message: string }
  | { kind: "unavailable_temporary"; message: string };

const buildCaption = (year: number, month: number): string =>
  `Acá tenés tu recibo de sueldo del período ${formatPayrollReceiptPeriod(year, month)}.`;

const buildSimulationMessage = (receipt: PayrollReceipt, periodLabel: string): string =>
  `Te enviamos tu recibo de sueldo correspondiente a ${periodLabel}.\n\n` +
  `(Simulación: el PDF no se adjunta acá. En WhatsApp real se enviaría como documento` +
  (receipt.originalFilename ? ` — ${receipt.originalFilename}` : "") +
  ".)";

const temporaryUnavailableMessage = (periodLabel: string): string =>
  `Tu recibo de ${periodLabel} está disponible, ` +
  "pero no pudimos enviarlo ahora. Volvé a indicar el período o esperá un momento e intentá de nuevo.";

const permanentUnavailableMessage = (periodLabel: string): string =>
  `Tu recibo de ${periodLabel} está disponible, ` +
  "pero no está habilitada la entrega por WhatsApp en este entorno. Contactá a administración.";

/**
 * Delivers an ASSOCIATED payroll receipt PDF via WhatsApp document (signed URL).
 * Never makes the bucket public. Does not log signed URLs.
 * In bot simulator / dry-run, skips Twilio and records a simulation artifact instead.
 */
export const payrollReceiptWhatsappDeliveryService = {
  async deliverReceipt(input: {
    toPhoneNumber: string;
    receipt: PayrollReceipt;
    companyId?: string;
    employeeId?: string | null;
    inboundMessageSid?: string | null;
    payrollReceiptId?: string;
  }): Promise<PayrollReceiptDeliveryResult> {
    const { receipt } = input;
    const periodLabel = formatPayrollReceiptPeriod(receipt.year, receipt.month);

    if (!receipt.storageObjectKey) {
      return {
        kind: "unavailable_permanent",
        message:
          "Encontramos el recibo pero no está disponible para descarga en este momento. Contactá a administración.",
      };
    }

    if (isSimulationActive()) {
      recordSimulationArtifact({
        type: "payroll_receipt_document",
        mode: "simulated",
        payrollReceiptId: receipt.id,
        year: receipt.year,
        month: receipt.month,
        period: periodLabel,
        originalFilename: receipt.originalFilename,
        note: "En WhatsApp real se enviaría el PDF como documento. El simulador no adjunta archivos.",
      });
      setTechnicalDetail("payrollReceiptDelivery", {
        status: "simulated",
        period: periodLabel,
        payrollReceiptId: receipt.id,
        originalFilename: receipt.originalFilename,
      });
      return {
        kind: "text_only",
        message: buildSimulationMessage(receipt, periodLabel),
      };
    }

    const storage = getAttachmentStorage();
    if (typeof storage.createSignedDownloadUrl !== "function") {
      return {
        kind: "unavailable_permanent",
        message: permanentUnavailableMessage(periodLabel),
      };
    }

    let mediaUrl: string;
    try {
      mediaUrl = await storage.createSignedDownloadUrl({
        objectKey: receipt.storageObjectKey,
        expiresInSeconds: env.PAYROLL_RECEIPT_MEDIA_URL_EXPIRATION_SECONDS,
        generation: receipt.objectGeneration ?? undefined,
      });
    } catch (error) {
      console.warn("[payroll-receipt-delivery] signed URL creation failed", {
        receiptId: receipt.id,
        error: error instanceof Error ? error.message : String(error),
      });
      const classification = classifyTwilioOutboundError(error);
      return {
        kind: classification.retryable ? "unavailable_temporary" : "unavailable_permanent",
        message: classification.retryable
          ? temporaryUnavailableMessage(periodLabel)
          : `Tu recibo de ${periodLabel} está disponible, ` +
            "pero no pudimos prepararlo para envío. Contactá a administración.",
      };
    }

    const caption = buildCaption(receipt.year, receipt.month);

    try {
      const result = await twilioOutboundService.sendWhatsAppDocument({
        toPhoneNumber: input.toPhoneNumber,
        body: caption,
        mediaUrl,
      });

      const companyId = input.companyId ?? receipt.companyId;
      const employeeId = input.employeeId ?? receipt.employeeId;
      try {
        await whatsappMessageRepository.create({
          companyId,
          messageSid: result.messageSid,
          direction: "OUTBOUND",
          employeeId,
          phoneFrom: env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+00000000000",
          phoneTo: input.toPhoneNumber,
          messageType: "DOCUMENT",
          body: caption,
          latitude: null,
          longitude: null,
          status: "SEND_ACCEPTED",
          rawPayload: null,
        });
      } catch (obsError) {
        console.warn("[payroll-receipt-delivery] outbound DOCUMENT persist failed (non-blocking)", {
          receiptId: receipt.id,
          error: obsError instanceof Error ? obsError.message : String(obsError),
        });
      }

      return {
        kind: "send_accepted",
        message: caption,
        messageSid: result.messageSid,
      };
    } catch (error) {
      const classification = classifyTwilioOutboundError(error);
      console.error("[payroll-receipt-delivery] Twilio document send failed", {
        receiptId: receipt.id,
        errorCode: classification.normalizedCode,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        kind: classification.retryable ? "unavailable_temporary" : "unavailable_permanent",
        message: classification.retryable
          ? temporaryUnavailableMessage(periodLabel)
          : `Tu recibo de ${periodLabel} está disponible, ` +
            "pero no pudimos enviarlo. Contactá a administración.",
      };
    }
  },
};
