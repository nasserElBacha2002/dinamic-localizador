import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractLocationMessageMetadata,
  isExplicitlyForwardedLocation,
  parseBooleanish,
} from "./location-message-metadata";

describe("parseBooleanish", () => {
  it("parses common truthy/falsy forms", () => {
    assert.equal(parseBooleanish(true), true);
    assert.equal(parseBooleanish("true"), true);
    assert.equal(parseBooleanish("1"), true);
    assert.equal(parseBooleanish(false), false);
    assert.equal(parseBooleanish("false"), false);
    assert.equal(parseBooleanish("0"), false);
    assert.equal(parseBooleanish(""), null);
    assert.equal(parseBooleanish(undefined), null);
    assert.equal(parseBooleanish("maybe"), null);
  });
});

describe("extractLocationMessageMetadata", () => {
  it("returns UNKNOWN when no forward signal is present (fail-open)", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-NORMAL",
      Latitude: "-34.6",
      Longitude: "-58.4",
    });
    assert.equal(meta.isForwarded, null);
    assert.equal(meta.isFrequentlyForwarded, null);
    assert.equal(meta.forwardDetection, "UNKNOWN");
    assert.equal(meta.sourceMessageSid, "SM-NORMAL");
    assert.equal(isExplicitlyForwardedLocation(meta), false);
  });

  it("detects Forwarded=true at top level", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-FWD",
      Latitude: "-34.6",
      Longitude: "-58.4",
      Forwarded: "true",
    });
    assert.equal(meta.isForwarded, true);
    assert.equal(meta.forwardDetection, "FORWARDED");
    assert.ok(meta.signalKeysFound.includes("Forwarded"));
    assert.equal(isExplicitlyForwardedLocation(meta), true);
  });

  it("detects FrequentlyForwarded=true", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-FREQ",
      FrequentlyForwarded: "true",
    });
    assert.equal(meta.isFrequentlyForwarded, true);
    assert.equal(meta.forwardDetection, "FORWARDED");
    assert.equal(isExplicitlyForwardedLocation(meta), true);
  });

  it("detects Meta-style context inside ChannelMetadata JSON", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-META",
      ChannelMetadata: JSON.stringify({ context: { forwarded: true } }),
    });
    assert.equal(meta.isForwarded, true);
    assert.equal(meta.forwardDetection, "FORWARDED");
  });

  it("treats explicit Forwarded=false as NOT_FORWARDED", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-NOT",
      Forwarded: "false",
    });
    assert.equal(meta.isForwarded, false);
    assert.equal(meta.forwardDetection, "NOT_FORWARDED");
    assert.equal(isExplicitlyForwardedLocation(meta), false);
  });

  it("does not invent not-forwarded from unrelated passthrough fields", () => {
    const meta = extractLocationMessageMetadata({
      MessageSid: "SM-OTHER",
      SmsStatus: "received",
      AccountSid: "AC123",
      Address: "Calle Falsa 123",
      Label: "Home",
    });
    assert.equal(meta.forwardDetection, "UNKNOWN");
  });
});
