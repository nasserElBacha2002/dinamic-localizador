import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { whatsappMetaCswEvidenceRepository } from "../../repositories/whatsapp/whatsapp-meta-csw-evidence.repository";
import { whatsappMetaCswEvidenceService } from "./whatsapp-meta-csw-evidence.service";

describe("whatsappMetaCswEvidenceService.resolveForOutboundSafe", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns null when repository throws (bot must continue)", async () => {
    mock.method(whatsappMetaCswEvidenceRepository, "resolveCustomerServiceWindowOpen", async () => {
      throw new Error("db timeout");
    });
    const result = await whatsappMetaCswEvidenceService.resolveForOutboundSafe({
      companyId: "11111111-1111-1111-1111-111111111111",
      customerPhone: "+5491111111111",
    });
    assert.equal(result, null);
  });
});