import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsv } from "../utils/csv";
import type { WhatsappMessageCostLedgerRow } from "../repositories/whatsapp-message-cost-ledger.repository";

describe("whatsapp message cost CSV export shape", () => {
  it("exports masked phones and cost quality without secrets", () => {
    const row: Pick<
      WhatsappMessageCostLedgerRow,
      | "id"
      | "companyId"
      | "providerMessageSid"
      | "sentAt"
      | "recipientPhoneMasked"
      | "messageKind"
      | "priceAmount"
      | "currency"
      | "costQuality"
      | "costSource"
    > = {
      id: "11111111-1111-1111-1111-111111111111",
      companyId: "22222222-2222-2222-2222-222222222222",
      providerMessageSid: "SMabc",
      sentAt: new Date("2026-09-01T12:00:00.000Z"),
      recipientPhoneMasked: "+54911******11",
      messageKind: "TEMPLATE",
      priceAmount: "0.005",
      currency: "USD",
      costQuality: "CONFIRMED",
      costSource: "TWILIO_MESSAGE_RESOURCE",
    };

    const csv = buildCsv(
      [
        "id",
        "companyId",
        "providerMessageSid",
        "sentAt",
        "recipientPhoneMasked",
        "messageKind",
        "priceAmount",
        "currency",
        "costQuality",
        "costSource",
      ],
      [
        [
          row.id,
          row.companyId,
          row.providerMessageSid,
          row.sentAt.toISOString(),
          row.recipientPhoneMasked,
          row.messageKind,
          row.priceAmount,
          row.currency,
          row.costQuality,
          row.costSource,
        ],
      ],
    );

    assert.match(csv, /CONFIRMED/);
    assert.match(csv, /\+54911\*{6}11/);
    assert.doesNotMatch(csv, /AuthToken|auth_token/i);
  });
});
