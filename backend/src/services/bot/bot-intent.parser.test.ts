import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBotIntent } from "./bot-intent.parser";

describe("parseBotIntent", () => {
  it("detects arrival intents", () => {
    assert.equal(parseBotIntent({ body: "Llegué" }), "arrival");
    assert.equal(parseBotIntent({ body: "llegue" }), "arrival");
    assert.equal(parseBotIntent({ body: "Llegue" }), "arrival");
  });

  it("detects checkout intents", () => {
    assert.equal(parseBotIntent({ body: "Terminé" }), "checkout");
    assert.equal(parseBotIntent({ body: "termine" }), "checkout");
    assert.equal(parseBotIntent({ body: "Me voy" }), "checkout");
  });

  it("detects absence intents", () => {
    assert.equal(parseBotIntent({ body: "Quiero pedir vacaciones" }), "absence");
    assert.equal(parseBotIntent({ body: "Pedir ausencia" }), "absence");
  });

  it("detects menu greetings and commands", () => {
    assert.equal(parseBotIntent({ body: "hola" }), "menu");
    assert.equal(parseBotIntent({ body: "buenos dias" }), "menu");
    assert.equal(parseBotIntent({ body: "menu" }), "menu");
    assert.equal(parseBotIntent({ body: "menú" }), "menu");
    assert.equal(parseBotIntent({ body: "inicio" }), "menu");
    assert.equal(parseBotIntent({ body: "ayuda" }), "menu");
    assert.equal(parseBotIntent({ body: "help" }), "menu");
  });

  it("detects location messages", () => {
    assert.equal(parseBotIntent({ body: "", hasLocation: true }), "location");
  });

  it("detects inventory numeric selection", () => {
    assert.equal(parseBotIntent({ body: "2" }), "inventory_selection");
  });

  it("detects cancel intent", () => {
    assert.equal(parseBotIntent({ body: "Cancelar" }), "cancel");
    assert.equal(parseBotIntent({ body: "salir" }), "cancel");
  });

  it("returns unknown for unsupported text", () => {
    assert.equal(parseBotIntent({ body: "texto random" }), "unknown");
    assert.equal(parseBotIntent({ body: "" }), "unknown");
  });
});
