import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MessageCostMonthlySummary } from "../../types/whatsapp-message-cost";

/**
 * Pure helper mirroring page rules: never pick byCurrency[0] as a global total.
 */
export function buildCurrencyCards(summary: MessageCostMonthlySummary) {
  return summary.byCurrency.map((row) => ({
    currency: row.currency,
    confirmedTotal: row.confirmedTotal,
    estimatedTotal: row.estimatedTotal,
    confirmedCount: row.confirmedCount,
    estimatedCount: row.estimatedCount,
  }));
}

describe("WhatsappMessageCosts multi-currency rules", () => {
  it("keeps per-currency amounts separate", () => {
    const summary = {
      byCurrency: [
        {
          currency: "USD",
          confirmedTotal: "1.00",
          estimatedTotal: "0",
          messageCount: 2,
          confirmedCount: 2,
          estimatedCount: 0,
          pendingCount: 0,
          unavailableCount: 0,
          pendingWithoutCurrencyCount: 0,
        },
        {
          currency: "EUR",
          confirmedTotal: "2.50",
          estimatedTotal: "0.10",
          messageCount: 3,
          confirmedCount: 2,
          estimatedCount: 1,
          pendingCount: 0,
          unavailableCount: 0,
          pendingWithoutCurrencyCount: 0,
        },
      ],
    } as MessageCostMonthlySummary;

    const cards = buildCurrencyCards(summary);
    assert.equal(cards.length, 2);
    assert.equal(cards[0]?.currency, "USD");
    assert.equal(cards[1]?.currency, "EUR");
    assert.notEqual(cards[0]?.confirmedTotal, cards[1]?.confirmedTotal);
  });
});
