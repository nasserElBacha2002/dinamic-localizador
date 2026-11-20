import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketingDemoHoneypotValue } from "./demo-request-honeypot";

describe("marketingDemoHoneypotValue", () => {
  it("descarta valor cuando el honeypot no fue tocado (autofill)", () => {
    assert.equal(marketingDemoHoneypotValue("https://autofill.example", false), "");
  });

  it("envía valor solo si el usuario editó el honeypot", () => {
    assert.equal(marketingDemoHoneypotValue("  https://bot.example  ", true), "https://bot.example");
  });
});