import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WHATSAPP_PROVIDER_STATUS_RANK } from "../constants/whatsapp-observability";
import { pickProjectedProviderStatus } from "../utils/whatsapp-observability";

describe("message cost provider status monotonicity", () => {
  it("rejects regressions used by cost ledger updates", () => {
    assert.equal(
      pickProjectedProviderStatus("read", "delivered", WHATSAPP_PROVIDER_STATUS_RANK),
      "read",
    );
    assert.equal(
      pickProjectedProviderStatus("delivered", "sent", WHATSAPP_PROVIDER_STATUS_RANK),
      "delivered",
    );
    assert.equal(
      pickProjectedProviderStatus("failed", "sent", WHATSAPP_PROVIDER_STATUS_RANK),
      "failed",
    );
  });

  it("allows advance and failed terminal", () => {
    assert.equal(
      pickProjectedProviderStatus("sent", "delivered", WHATSAPP_PROVIDER_STATUS_RANK),
      "delivered",
    );
    assert.equal(
      pickProjectedProviderStatus("delivered", "failed", WHATSAPP_PROVIDER_STATUS_RANK),
      "failed",
    );
  });
});
