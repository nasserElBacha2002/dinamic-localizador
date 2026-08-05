import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";
import type { PayrollReceipt } from "../types/payroll-receipt";

const baseReceipt: PayrollReceipt = {
  id: "receipt-1",
  companyId: "company-1",
  batchId: "batch-1",
  employeeId: "employee-1",
  year: 2026,
  month: 6,
  originalFilename: "recibo-0626.pdf",
  storageProvider: "GOOGLE_CLOUD_STORAGE",
  storageBucket: "bucket",
  storageObjectKey: "payroll/recibo-0626.pdf",
  objectGeneration: null,
  detectedDocument: null,
  normalizedDocument: null,
  status: "ASSOCIATED",
  errorCode: null,
  errorMessage: null,
  mimeType: "application/pdf",
  fileSize: 1000,
  checksumSha256: null,
  idempotencyKey: null,
  uploadedByUserId: null,
  replacedReceiptId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  deletedByUserId: null,
  employeeName: "Cristian",
};

describe("payrollReceiptWhatsappDeliveryService simulation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("skips Twilio and explains dry-run when simulation is active", async () => {
    const { payrollReceiptWhatsappDeliveryService } = await import(
      "./payroll-receipt-whatsapp-delivery.service"
    );
    const { twilioOutboundService } = await import("./twilio-outbound.service");
    mock.method(twilioOutboundService, "sendWhatsAppDocument", async () => {
      throw new Error("should not call Twilio in simulation");
    });

    const context = {
      simulationSessionId: "sim-1",
      employeeIdOverride: "employee-1",
      phoneNumber: "+5491100000000",
      simulatedNow: new Date(),
      mode: "dry-run" as const,
      skipWhatsAppPersistence: true,
      messages: [],
      technicalDetails: {} as Record<string, unknown>,
      simulationArtifacts: [] as Array<Record<string, unknown>>,
      virtualAttendanceRecords: [],
      lastBotResponse: null,
      lastDetectedIntent: null,
      lastTwilioPayload: null,
    };

    const result = await runWithBotRuntimeContext(context, async () =>
      payrollReceiptWhatsappDeliveryService.deliverReceipt({
        toPhoneNumber: "+5491100000000",
        receipt: baseReceipt,
      }),
    );

    assert.equal(result.kind, "text_only");
    assert.match(result.message, /Simulación/);
    assert.match(result.message, /recibo-0626\.pdf/);
    assert.equal(context.simulationArtifacts.length, 1);
    assert.equal(context.simulationArtifacts[0]?.type, "payroll_receipt_document");
    assert.equal(
      (context.technicalDetails.payrollReceiptDelivery as { status: string }).status,
      "simulated",
    );
  });
});
