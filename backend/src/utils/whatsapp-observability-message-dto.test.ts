import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapMessageToObservabilityDto } from "./whatsapp-observability-message-dto";
import type { WhatsAppMessage } from "../types/twilio.types";

const baseMessage = (): WhatsAppMessage => ({
  id: "11111111-1111-1111-1111-111111111111",
  companyId: "22222222-2222-2222-2222-222222222222",
  messageSid: "SM123",
  direction: "INBOUND",
  employeeId: null,
  phoneFrom: "+5491112345678",
  phoneTo: "+5491199999999",
  messageType: "TEXT",
  body: "hola",
  latitude: -34.6,
  longitude: -58.4,
  status: "RECEIVED",
  rawPayload: '{"AccountSid":"secret"}',
  processingStatus: "RECEIVED",
  processingErrorCode: null,
  processedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("mapMessageToObservabilityDto", () => {
  it("masks phones and hides location/payload by default", () => {
    const dto = mapMessageToObservabilityDto(baseMessage());
    assert.notEqual(dto.phoneFrom, "+5491112345678");
    assert.ok(dto.phoneFrom.includes("******"));
    assert.notEqual(dto.phoneTo, "+5491199999999");
    assert.equal(dto.latitude, null);
    assert.equal(dto.longitude, null);
    assert.equal(dto.rawPayload, undefined);
  });

  it("can reveal phone when explicitly requested", () => {
    const dto = mapMessageToObservabilityDto(baseMessage(), { revealPhone: true });
    assert.equal(dto.phoneFrom, "+5491112345678");
  });
});
