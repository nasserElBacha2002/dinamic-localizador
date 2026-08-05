import { env } from "../config/env";
import { getAttachmentStorage } from "./attachment-storage";
import { formatPayrollReceiptPeriod } from "../utils/payroll-receipts/period-format";
import {
  isSimulationActive,
  recordSimulationArtifact,
  setTechnicalDetail,
} from "../utils/bot-runtime-context";
import { twilioOutboundService } from "./twilio-outbound.service";
import type { PayrollReceipt } from "../types/payroll-receipt";

export type PayrollReceiptDeliveryResult =
  | { kind: "delivered"; message: string; messageSid?: string }
  | { kind: "text_only"; message: string }
  | { kind: "unavailable"; message: string };

const buildCaption = (year: number, month: number): string =>
  `Acá tenés tu recibo de sueldo del período ${formatPayrollReceiptPeriod(year, month)}.`;

const buildSimulationMessage = (receipt: PayrollReceipt, periodLabel: string): string =>
  `Te enviamos tu recibo de sueldo correspondiente a ${periodLabel}.\n\n` +
  `(Simulación: el PDF no se adjunta acá. En WhatsApp real se enviaría como documento` +
  (receipt.originalFilename ? ` — ${receipt.originalFilename}` : "") +
  ".)";

/**
 * Delivers an ASSOCIATED payroll receipt PDF via WhatsApp document (signed URL).
 * Never makes the bucket public. Does not log signed URLs.
 * In bot simulator / dry-run, skips Twilio and records a simulation artifact instead.
 */
export const payrollReceiptWhatsappDeliveryService = {
  async deliverReceipt(input: {
    toPhoneNumber: string;
    receipt: PayrollReceipt;
  }): Promise<PayrollReceiptDeliveryResult> {
    const { receipt } = input;
    const periodLabel = formatPayrollReceiptPeriod(receipt.year, receipt.month);

    if (!receipt.storageObjectKey) {
      return {
        kind: "unavailable",
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
        kind: "unavailable",
        message:
          `Tu recibo de ${periodLabel} está disponible, ` +
          "pero la entrega por WhatsApp no está habilitada en este entorno.",
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
      return {
        kind: "unavailable",
        message:
          `Tu recibo de ${periodLabel} está disponible, ` +
          "pero no pudimos enviarlo ahora. Intentá más tarde o contactá a administración.",
      };
    }

    const caption = buildCaption(receipt.year, receipt.month);

    try {
      const result = await twilioOutboundService.sendWhatsAppDocument({
        toPhoneNumber: input.toPhoneNumber,
        body: caption,
        mediaUrl,
      });
      return {
        kind: "delivered",
        message: caption,
        messageSid: result.messageSid,
      };
    } catch (error) {
      console.error("[payroll-receipt-delivery] Twilio document send failed", {
        receiptId: receipt.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        kind: "unavailable",
        message:
          `Tu recibo de ${periodLabel} está disponible, ` +
          "pero no pudimos enviarlo ahora. Intentá más tarde.",
      };
    }
  },
};
