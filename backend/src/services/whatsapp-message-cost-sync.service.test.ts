import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { whatsappMessageCostLedgerRepository } from "../repositories/whatsapp-message-cost-ledger.repository";
import { whatsappMessageCostSyncService } from "./whatsapp-message-cost-sync.service";

const baseRow = {
  id: "11111111-1111-1111-1111-111111111111",
  companyId: "22222222-2222-2222-2222-222222222222",
  companyNameSnapshot: "Acme",
  whatsappMessageId: null,
  providerMessageSid: "SMcost1",
  channel: "WHATSAPP",
  direction: "OUTBOUND" as const,
  sentAt: new Date("2026-09-01T12:00:00.000Z"),
  recipientPhoneMasked: "+54911******11",
  messageKind: "TEMPLATE" as const,
  templateSid: "HXabc",
  templateName: null,
  flowLabel: "ARRIVAL_REMINDER",
  providerStatus: "delivered",
  providerStatusAt: null,
  pricingCategory: null,
  priceAmount: null,
  currency: null,
  costQuality: "PENDING" as const,
  costSource: "NONE" as const,
  tariffId: null,
  lastSyncedAt: null,
  syncAttemptCount: 1,
  nextSyncAt: null,
  leaseOwner: "worker",
  leaseExpiresAt: new Date(),
  lastSyncErrorCode: null,
  lastSyncErrorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("whatsappMessageCostSyncService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("marks CONFIRMED when Twilio Message.price is available", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    const confirmed = mock.method(
      whatsappMessageCostLedgerRepository,
      "markConfirmed",
      async () => true,
    );

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => ({
        price: "-0.00500",
        priceUnit: "USD",
        status: "delivered",
      }),
    });

    assert.equal(result.confirmed, 1);
    assert.equal(confirmed.mock.callCount(), 1);
    const args = confirmed.mock.calls[0]?.arguments[0] as { priceAmount: string };
    assert.equal(args.priceAmount, "0.005");
  });

  it("accepts zero price as CONFIRMED", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    const confirmed = mock.method(
      whatsappMessageCostLedgerRepository,
      "markConfirmed",
      async () => true,
    );

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => ({ price: "0", priceUnit: "USD", status: "delivered" }),
    });
    assert.equal(result.confirmed, 1);
    assert.equal(confirmed.mock.callCount(), 1);
  });

  it("increments leaseLost when markConfirmed returns false", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    mock.method(whatsappMessageCostLedgerRepository, "markConfirmed", async () => false);

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => ({
        price: "-0.01",
        priceUnit: "USD",
        status: "delivered",
      }),
    });
    assert.equal(result.confirmed, 0);
    assert.equal(result.leaseLost, 1);
  });

  it("retries as PENDING when price is not yet available", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow, syncAttemptCount: 2 } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    const pending = mock.method(
      whatsappMessageCostLedgerRepository,
      "markPendingRetry",
      async () => true,
    );

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => ({ price: null, priceUnit: null, status: "sent" }),
    });
    assert.equal(result.pending, 1);
    assert.equal(pending.mock.callCount(), 1);
  });

  it("marks UNAVAILABLE after max attempts without inventing a global estimate", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow, syncAttemptCount: 99 } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    const unavailable = mock.method(
      whatsappMessageCostLedgerRepository,
      "markUnavailable",
      async () => true,
    );

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => ({ price: null, priceUnit: null, status: "delivered" }),
    });
    assert.equal(result.unavailable, 1);
    assert.equal(unavailable.mock.callCount(), 1);
  });

  it("marks UNAVAILABLE on Twilio 404", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    const unavailable = mock.method(
      whatsappMessageCostLedgerRepository,
      "markUnavailable",
      async () => true,
    );

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => {
        const error = new Error("Not Found") as Error & { status: number; code: number };
        error.status = 404;
        error.code = 20404;
        throw error;
      },
    });
    assert.equal(result.unavailable, 1);
    assert.equal(unavailable.mock.callCount(), 1);
  });

  it("schedules retry on Twilio 429", async () => {
    let claims = 0;
    mock.method(whatsappMessageCostLedgerRepository, "claimNextPending", async () => {
      claims += 1;
      return claims === 1 ? { ...baseRow, syncAttemptCount: 1 } : null;
    });
    mock.method(whatsappMessageCostLedgerRepository, "recordHeartbeat", async () => undefined);
    const pending = mock.method(
      whatsappMessageCostLedgerRepository,
      "markPendingRetry",
      async () => true,
    );

    const result = await whatsappMessageCostSyncService.processPendingBatch(5, {
      fetchPrice: async () => {
        const error = new Error("Too Many Requests") as Error & { status: number; code: number };
        error.status = 429;
        error.code = 20429;
        throw error;
      },
    });
    assert.equal(result.pending, 1);
    assert.equal(result.failed, 1);
    assert.equal(pending.mock.callCount(), 1);
  });
});
