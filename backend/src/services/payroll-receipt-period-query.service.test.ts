import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { PayrollReceipt } from "../types/payroll-receipt";
import { payrollReceiptRepository } from "../repositories/payroll-receipt.repository";
import { payrollReceiptQueryDeliveryRepository } from "../repositories/payroll-receipt-query-delivery.repository";
import { payrollReceiptWhatsappDeliveryService } from "./payroll-receipt-whatsapp-delivery.service";
import { payrollReceiptPeriodQueryService } from "./payroll-receipt-period-query.service";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";

const COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EMPLOYEE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SESSION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const stub = <T extends object, K extends keyof T>(obj: T, key: K, impl: T[K]) => {
  const previous = obj[key];
  obj[key] = impl;
  return () => {
    obj[key] = previous;
  };
};

const receipt = (
  id: string,
  createdAt: string,
  year = 2026,
  month = 7,
): PayrollReceipt =>
  ({
    id,
    companyId: COMPANY_ID,
    batchId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    employeeId: EMPLOYEE_ID,
    year,
    month,
    status: "ASSOCIATED",
    originalFilename: `${id}.pdf`,
    storageProvider: "GOOGLE_CLOUD_STORAGE",
    storageBucket: "b",
    storageObjectKey: `k/${id}`,
    objectGeneration: "1",
    detectedDocument: "20123456786",
    normalizedDocument: "20123456786",
    errorCode: null,
    errorMessage: null,
    mimeType: "application/pdf",
    fileSize: 10,
    checksumSha256: id.replace(/-/g, "").slice(0, 64).padEnd(64, "0"),
    idempotencyKey: null,
    uploadedByUserId: null,
    replacedReceiptId: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    deletedByUserId: null,
    employeeName: "Juan",
  }) as PayrollReceipt;

const simContext = {
  simulationSessionId: "sim-payroll-multi",
  employeeIdOverride: EMPLOYEE_ID,
  phoneNumber: "+5491100000000",
  simulatedNow: new Date(),
  mode: "dry-run" as const,
  skipWhatsAppPersistence: true,
  messages: [],
  technicalDetails: {},
  simulationArtifacts: [] as Array<Record<string, unknown>>,
  virtualAttendanceRecords: [],
  lastBotResponse: null,
  lastDetectedIntent: null,
  lastTwilioPayload: null,
};

describe("payrollReceiptPeriodQueryService", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    while (restores.length > 0) {
      restores.pop()?.();
    }
  });

  it("returns not_found when there are no active receipts", async () => {
    restores.push(stub(payrollReceiptRepository, "listActiveAssociated", async () => []));
    const result = await payrollReceiptPeriodQueryService.deliverForPeriod({
      companyId: COMPANY_ID,
      employeeId: EMPLOYEE_ID,
      botSessionId: SESSION_ID,
      toPhoneNumber: "+5491100000000",
      year: 2026,
      month: 7,
    });
    assert.equal(result.kind, "not_found");
  });

  it("returns completed for a single receipt", async () => {
    const a = receipt("11111111-1111-4111-8111-111111111111", "2026-07-01T10:00:00.000Z");
    const deliveryState = new Map([[a.id, "PENDING" as const]]);
    restores.push(
      stub(payrollReceiptRepository, "listActiveAssociated", async () => [a]),
      stub(payrollReceiptQueryDeliveryRepository, "ensurePendingDeliveries", async () => undefined),
      stub(payrollReceiptQueryDeliveryRepository, "listForQuery", async () => [
        {
          id: a.id,
          companyId: COMPANY_ID,
          botSessionId: SESSION_ID,
          payrollReceiptId: a.id,
          employeeId: EMPLOYEE_ID,
          year: 2026,
          month: 7,
          status: deliveryState.get(a.id)!,
          providerMessageSid: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          acceptedAt: null,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        },
      ]),
      stub(payrollReceiptQueryDeliveryRepository, "markAccepted", async () => {
        deliveryState.set(a.id, "ACCEPTED" as never);
      }),
      stub(payrollReceiptWhatsappDeliveryService, "deliverReceipt", async () => ({
        kind: "text_only" as const,
        message: "ok",
      })),
    );

    await runWithBotRuntimeContext(simContext, async () => {
      const result = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 7,
      });
      assert.equal(result.kind, "completed");
      assert.equal(result.deliveredCount, 1);
      assert.equal(result.totalCount, 1);
    });
  });

  it("delivers N receipts in list order and completes when all accepted", async () => {
    const a = receipt("11111111-1111-4111-8111-111111111111", "2026-07-01T10:00:00.000Z");
    const b = receipt("22222222-2222-4222-8222-222222222222", "2026-07-01T11:00:00.000Z");
    const c = receipt("33333333-3333-4333-8333-333333333333", "2026-07-01T12:00:00.000Z");
    const deliveryState = new Map<string, "PENDING" | "ACCEPTED" | "FAILED">([
      [a.id, "PENDING"],
      [b.id, "PENDING"],
      [c.id, "PENDING"],
    ]);
    const sendOrder: string[] = [];

    restores.push(
      stub(payrollReceiptRepository, "listActiveAssociated", async () => [a, b, c]),
      stub(payrollReceiptQueryDeliveryRepository, "ensurePendingDeliveries", async () => undefined),
      stub(payrollReceiptQueryDeliveryRepository, "listForQuery", async () =>
        [a, b, c].map((r) => ({
          id: r.id,
          companyId: COMPANY_ID,
          botSessionId: SESSION_ID,
          payrollReceiptId: r.id,
          employeeId: EMPLOYEE_ID,
          year: 2026,
          month: 7,
          status: deliveryState.get(r.id)!,
          providerMessageSid: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          acceptedAt: null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      ),
      stub(payrollReceiptQueryDeliveryRepository, "markAccepted", async (input) => {
        deliveryState.set(input.payrollReceiptId, "ACCEPTED");
      }),
      stub(payrollReceiptWhatsappDeliveryService, "deliverReceipt", async (input) => {
        sendOrder.push(input.receipt.id);
        return { kind: "text_only" as const, message: "ok" };
      }),
    );

    await runWithBotRuntimeContext(simContext, async () => {
      const result = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 7,
      });
      assert.equal(result.kind, "completed");
      assert.equal(result.deliveredCount, 3);
      assert.equal(result.totalCount, 3);
      assert.deepEqual(sendOrder, [a.id, b.id, c.id]);
    });
  });

  it("new bot session can resend receipts already ACCEPTED in a prior session", async () => {
    const a = receipt("11111111-1111-4111-8111-111111111111", "2026-07-01T10:00:00.000Z");
    const priorSession = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const newSession = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
    const store = new Map<string, "PENDING" | "ACCEPTED" | "FAILED">();
    store.set(`${priorSession}:2026-7:${a.id}`, "ACCEPTED");
    const sendOrder: string[] = [];

    restores.push(
      stub(payrollReceiptRepository, "listActiveAssociated", async () => [a]),
      stub(payrollReceiptQueryDeliveryRepository, "ensurePendingDeliveries", async (input) => {
        const key = `${input.botSessionId}:${input.year}-${input.month}:${input.payrollReceiptIds[0]}`;
        if (!store.has(key)) {
          store.set(key, "PENDING");
        }
      }),
      stub(payrollReceiptQueryDeliveryRepository, "listForQuery", async (key) => {
        const sk = `${key.botSessionId}:${key.year}-${key.month}:${a.id}`;
        return [
          {
            id: a.id,
            companyId: COMPANY_ID,
            botSessionId: key.botSessionId,
            payrollReceiptId: a.id,
            employeeId: EMPLOYEE_ID,
            year: key.year,
            month: key.month,
            status: store.get(sk) ?? "PENDING",
            providerMessageSid: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            acceptedAt: null,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          },
        ];
      }),
      stub(payrollReceiptQueryDeliveryRepository, "markAccepted", async (input) => {
        store.set(
          `${input.botSessionId}:${input.year}-${input.month}:${input.payrollReceiptId}`,
          "ACCEPTED",
        );
      }),
      stub(payrollReceiptWhatsappDeliveryService, "deliverReceipt", async (input) => {
        sendOrder.push(input.receipt.id);
        return { kind: "text_only" as const, message: "ok" };
      }),
    );

    await runWithBotRuntimeContext(simContext, async () => {
      const result = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: newSession,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 7,
      });
      assert.equal(result.kind, "completed");
      assert.deepEqual(sendOrder, [a.id]);
      assert.equal(store.get(`${priorSession}:2026-7:${a.id}`), "ACCEPTED");
      assert.equal(store.get(`${newSession}:2026-7:${a.id}`), "ACCEPTED");
    });
  });

  it("marks permanent partial as partial_failed (never completed)", async () => {
    const a = receipt("11111111-1111-4111-8111-111111111111", "2026-07-01T10:00:00.000Z");
    const b = receipt("22222222-2222-4222-8222-222222222222", "2026-07-01T11:00:00.000Z");
    const c = receipt("33333333-3333-4333-8333-333333333333", "2026-07-01T12:00:00.000Z");
    const deliveryState = new Map<string, "PENDING" | "ACCEPTED" | "FAILED">([
      [a.id, "PENDING"],
      [b.id, "PENDING"],
      [c.id, "PENDING"],
    ]);
    const failedIds: string[] = [];

    restores.push(
      stub(payrollReceiptRepository, "listActiveAssociated", async () => [a, b, c]),
      stub(payrollReceiptQueryDeliveryRepository, "ensurePendingDeliveries", async () => undefined),
      stub(payrollReceiptQueryDeliveryRepository, "listForQuery", async (key) => {
        assert.equal(key.year, 2026);
        assert.equal(key.month, 7);
        return [a, b, c].map((r) => ({
          id: r.id,
          companyId: COMPANY_ID,
          botSessionId: SESSION_ID,
          payrollReceiptId: r.id,
          employeeId: EMPLOYEE_ID,
          year: 2026,
          month: 7,
          status: deliveryState.get(r.id)!,
          providerMessageSid: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          acceptedAt: null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
      }),
      stub(payrollReceiptQueryDeliveryRepository, "markAccepted", async (input) => {
        deliveryState.set(input.payrollReceiptId, "ACCEPTED");
      }),
      stub(payrollReceiptQueryDeliveryRepository, "markFailed", async (input) => {
        deliveryState.set(input.payrollReceiptId, "FAILED");
        failedIds.push(input.payrollReceiptId);
      }),
      stub(payrollReceiptWhatsappDeliveryService, "deliverReceipt", async (input) => {
        if (input.receipt.id === b.id) {
          return { kind: "unavailable_permanent" as const, message: "permanent" };
        }
        return { kind: "text_only" as const, message: "ok" };
      }),
    );

    await runWithBotRuntimeContext(simContext, async () => {
      const result = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 7,
      });
      assert.equal(result.kind, "partial_failed");
      assert.equal(result.deliveredCount, 2);
      assert.equal(result.totalCount, 3);
      assert.deepEqual(failedIds, [b.id]);
      assert.equal(deliveryState.get(b.id), "FAILED");
    });
  });

  it("isolates July deliveries from an August query in the same session", async () => {
    const julyA = receipt("11111111-1111-4111-8111-111111111111", "2026-07-01T10:00:00.000Z", 2026, 7);
    const augC = receipt("33333333-3333-4333-8333-333333333333", "2026-08-01T10:00:00.000Z", 2026, 8);
    const augD = receipt("44444444-4444-4444-8444-444444444444", "2026-08-01T11:00:00.000Z", 2026, 8);

    const store = new Map<string, "PENDING" | "ACCEPTED" | "FAILED">();
    // July leftover must not affect August counts.
    store.set(`${SESSION_ID}:2026-7:${julyA.id}`, "ACCEPTED");

    restores.push(
      stub(payrollReceiptRepository, "listActiveAssociated", async (_c, _e, year, month) => {
        if (year === 2026 && month === 8) {
          return [augC, augD];
        }
        return [julyA];
      }),
      stub(payrollReceiptQueryDeliveryRepository, "ensurePendingDeliveries", async (input) => {
        for (const id of input.payrollReceiptIds) {
          const key = `${input.botSessionId}:${input.year}-${input.month}:${id}`;
          if (!store.has(key)) {
            store.set(key, "PENDING");
          }
        }
      }),
      stub(payrollReceiptQueryDeliveryRepository, "listForQuery", async (key) => {
        const receipts =
          key.month === 8 ? [augC, augD] : key.month === 7 ? [julyA] : [];
        return receipts
          .map((r) => {
            const sk = `${key.botSessionId}:${key.year}-${key.month}:${r.id}`;
            return {
              id: r.id,
              companyId: COMPANY_ID,
              botSessionId: SESSION_ID,
              payrollReceiptId: r.id,
              employeeId: EMPLOYEE_ID,
              year: key.year,
              month: key.month,
              status: store.get(sk) ?? "PENDING",
              providerMessageSid: null,
              lastErrorCode: null,
              lastErrorMessage: null,
              acceptedAt: null,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            };
          })
          .filter((d) => d.year === key.year && d.month === key.month);
      }),
      stub(payrollReceiptQueryDeliveryRepository, "markAccepted", async (input) => {
        store.set(
          `${input.botSessionId}:${input.year}-${input.month}:${input.payrollReceiptId}`,
          "ACCEPTED",
        );
      }),
      stub(payrollReceiptWhatsappDeliveryService, "deliverReceipt", async () => ({
        kind: "text_only" as const,
        message: "ok",
      })),
    );

    await runWithBotRuntimeContext(simContext, async () => {
      const august = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 8,
      });
      assert.equal(august.kind, "completed");
      assert.equal(august.deliveredCount, 2);
      assert.equal(august.totalCount, 2);
    });
  });

  it("retries temporary failures skipping already ACCEPTED receipts", async () => {
    const a = receipt("11111111-1111-4111-8111-111111111111", "2026-07-01T10:00:00.000Z");
    const b = receipt("22222222-2222-4222-8222-222222222222", "2026-07-01T11:00:00.000Z");
    const c = receipt("33333333-3333-4333-8333-333333333333", "2026-07-01T12:00:00.000Z");
    const deliveryState = new Map<string, "PENDING" | "ACCEPTED" | "FAILED">([
      [a.id, "PENDING"],
      [b.id, "PENDING"],
      [c.id, "PENDING"],
    ]);
    const sendOrder: string[] = [];

    restores.push(
      stub(payrollReceiptRepository, "listActiveAssociated", async () => [a, b, c]),
      stub(payrollReceiptQueryDeliveryRepository, "ensurePendingDeliveries", async () => undefined),
      stub(payrollReceiptQueryDeliveryRepository, "listForQuery", async () =>
        [a, b, c].map((r) => ({
          id: r.id,
          companyId: COMPANY_ID,
          botSessionId: SESSION_ID,
          payrollReceiptId: r.id,
          employeeId: EMPLOYEE_ID,
          year: 2026,
          month: 7,
          status: deliveryState.get(r.id)!,
          providerMessageSid: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          acceptedAt: null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      ),
      stub(payrollReceiptQueryDeliveryRepository, "markAccepted", async (input) => {
        deliveryState.set(input.payrollReceiptId, "ACCEPTED");
      }),
      stub(payrollReceiptQueryDeliveryRepository, "markFailed", async (input) => {
        deliveryState.set(input.payrollReceiptId, "FAILED");
      }),
      stub(payrollReceiptWhatsappDeliveryService, "deliverReceipt", async (input) => {
        sendOrder.push(input.receipt.id);
        if (input.receipt.id === b.id && sendOrder.filter((id) => id === b.id).length === 1) {
          return { kind: "unavailable_temporary" as const, message: "temp fail" };
        }
        return { kind: "text_only" as const, message: "ok" };
      }),
    );

    await runWithBotRuntimeContext(simContext, async () => {
      const first = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 7,
      });
      assert.equal(first.kind, "partial_temporary");
      assert.equal(first.deliveredCount, 2);
      assert.deepEqual(sendOrder, [a.id, b.id, c.id]);

      const retry = await payrollReceiptPeriodQueryService.deliverForPeriod({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        toPhoneNumber: "+5491100000000",
        year: 2026,
        month: 7,
        introAlreadySent: true,
      });
      assert.equal(retry.kind, "completed");
      assert.equal(retry.deliveredCount, 3);
      assert.deepEqual(sendOrder, [a.id, b.id, c.id, b.id]);
    });
  });
});
