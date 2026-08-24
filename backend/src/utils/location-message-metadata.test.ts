import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractLocationMessageMetadata,
  isExplicitlyForwardedLocation,
  parseTwilioFlag,
} from "./location-message-metadata";

describe("parseTwilioFlag", () => {
  it("parses Twilio truthy/falsy forms and rejects inventing true", () => {
    assert.equal(parseTwilioFlag(true), true);
    assert.equal(parseTwilioFlag("true"), true);
    assert.equal(parseTwilioFlag("1"), true);
    assert.equal(parseTwilioFlag(false), false);
    assert.equal(parseTwilioFlag("false"), false);
    assert.equal(parseTwilioFlag("0"), false);
    assert.equal(parseTwilioFlag(""), false);
    assert.equal(parseTwilioFlag(undefined), false);
    assert.equal(parseTwilioFlag("maybe"), false);
    assert.equal(parseTwilioFlag("yes"), false);
  });
});

describe("extractLocationMessageMetadata", () => {
  it("treats absent Forwarded/FrequentlyForwarded as false (Twilio normal message)", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-NORMAL",
      Latitude: "-34.6",
      Longitude: "-58.4",
    });
    assert.equal(meta.isForwarded, false);
    assert.equal(meta.isFrequentlyForwarded, false);
    assert.equal(meta.sourceMessageSid, "SM-NORMAL");
    assert.equal(isExplicitlyForwardedLocation(meta), false);
  });

  it("detects Forwarded=true", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-FWD",
      Latitude: "-34.6",
      Longitude: "-58.4",
      Forwarded: "true",
    });
    assert.equal(meta.isForwarded, true);
    assert.equal(meta.isFrequentlyForwarded, false);
    assert.equal(isExplicitlyForwardedLocation(meta), true);
  });

  it("detects FrequentlyForwarded=true", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-FREQ",
      FrequentlyForwarded: "true",
    });
    assert.equal(meta.isForwarded, false);
    assert.equal(meta.isFrequentlyForwarded, true);
    assert.equal(isExplicitlyForwardedLocation(meta), true);
  });

  it("treats Forwarded=false as not forwarded", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-NOT",
      Forwarded: "false",
    });
    assert.equal(meta.isForwarded, false);
    assert.equal(isExplicitlyForwardedLocation(meta), false);
  });

  it("ignores speculative aliases (only Twilio Forwarded / FrequentlyForwarded)", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-ALIAS",
      WhatsappForwarded: "true",
      ChannelMetadata: JSON.stringify({ context: { forwarded: true } }),
      is_forwarded: "true",
    });
    assert.equal(meta.isForwarded, false);
    assert.equal(meta.isFrequentlyForwarded, false);
    assert.equal(isExplicitlyForwardedLocation(meta), false);
  });
});
