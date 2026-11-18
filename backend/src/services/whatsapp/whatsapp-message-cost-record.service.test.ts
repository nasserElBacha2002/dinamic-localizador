import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { whatsappMessageCostLedgerRepository } from "../../repositories/whatsapp/whatsapp-message-cost-ledger.repository";
import { whatsappMessageCostRecordService } from "./whatsapp-message-cost-record.service";
import { whatsappMessageCostMetaClassificationService } from "./whatsapp-message-cost-meta-classification.service";
import { whatsappMessageCostMetaPricingService } from "./whatsapp-message-cost-meta-pricing.service";

describe("whatsappMessageCostRecordService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("records PENDING ledger row after outbound accept with SID", async () => {
    mock.method(whatsappMessageCostMetaClassificationService, "classify", async () => "UTILITY");
    mock.method(whatsappMessageCostMetaPricingService, "applyForLedgerRow", async () => true);
    const insert = mock.method(
      whatsappMessageCostLedgerRepository,
      "insertIgnoreDuplicate",
      async () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    mock.method(whatsappMessageCostLedgerRepository, "getById", async () => null);

    await whatsappMessageCostRecordService.recordOutboundAccepted({
      companyId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      providerMessageSid: "SMabc",
      toPhoneNumber: "+5491111111111",
      messageKind: "TEMPLATE",
      templateSid: "HXabc",
      flowLabel: "ARRIVAL_REMINDER",
    });

    assert.equal(insert.mock.callCount(), 1);
    const args = insert.mock.calls[0]?.arguments[0] as {
      costQuality: string;
      recipientPhoneMasked: string;
      companyId: string;
    };
    assert.equal(args.costQuality, "PENDING");
    assert.equal(args.companyId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    assert.match(args.recipientPhoneMasked, /\*/);
  });

  it("does not throw when ledger insert fails", async () => {
    mock.method(whatsappMessageCostLedgerRepository, "insertIgnoreDuplicate", async () => {
      throw new Error("db down");
    });

    await assert.doesNotReject(() =>
      whatsappMessageCostRecordService.recordOutboundAccepted({
        companyId: null,
        providerMessageSid: "SMfail",
        toPhoneNumber: "+5491111111111",
        messageKind: "TEXT",
      }),
    );
  });

  it("records UNAVAILABLE when SID is missing", async () => {
    mock.method(whatsappMessageCostMetaClassificationService, "classify", async () => "SERVICE");
    mock.method(whatsappMessageCostMetaPricingService, "applyForLedgerRow", async () => true);
    const insert = mock.method(
      whatsappMessageCostLedgerRepository,
      "insertIgnoreDuplicate",
      async () => "cccccccc-cccc-cccc-cccc-cccccccccccc",
    );
    mock.method(whatsappMessageCostLedgerRepository, "getById", async () => null);

    await whatsappMessageCostRecordService.recordOutboundAccepted({
      companyId: null,
      providerMessageSid: null,
      toPhoneNumber: "+5491111111111",
      messageKind: "BOT_TWIML",
    });

    const args = insert.mock.calls[0]?.arguments[0] as { costQuality: string };
    assert.equal(args.costQuality, "UNAVAILABLE");
  });
});
