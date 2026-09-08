import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBotIntent } from "./bot-intent.parser";

describe("parseBotIntent", () => {
  it("detects arrival intents", () => {
    for (const body of [
      "Llegué",
      "llegue",
      "ya llegué",
      "estoy acá",
      "estoy en el lugar",
      "quiero marcar llegada",
      "marcar ingreso",
      "ingresé",
    ]) {
      assert.equal(parseBotIntent({ body }), "arrival", body);
    }
  });

  it("detects checkout intents", () => {
    for (const body of [
      "Terminé",
      "termine",
      "Me voy",
      "salí",
      "ya salí",
      "ya me fui",
      "quiero marcar salida",
      "marcar salida",
      "finalicé",
    ]) {
      assert.equal(parseBotIntent({ body }), "checkout", body);
    }
  });

  it("detects absence intents", () => {
    assert.equal(parseBotIntent({ body: "Quiero pedir vacaciones" }), "absence");
    assert.equal(parseBotIntent({ body: "Pedir ausencia" }), "absence");
  });

  it("detects workday and upcoming assignment intents", () => {
    assert.equal(parseBotIntent({ body: "mi jornada" }), "workday");
    assert.equal(parseBotIntent({ body: "hoy" }), "workday");
    assert.equal(parseBotIntent({ body: "mis turnos" }), "upcoming_assignments");
    assert.equal(parseBotIntent({ body: "agenda" }), "upcoming_assignments");
  });

  it("detects payroll receipt intents", () => {
    assert.equal(parseBotIntent({ body: "Mi recibo" }), "payroll_receipt");
    assert.equal(parseBotIntent({ body: "recibo de sueldo" }), "payroll_receipt");
    assert.equal(parseBotIntent({ body: "Consultar recibo" }), "payroll_receipt");
  });

  it("detects assignment confirmation and unavailability intents", () => {
    assert.equal(parseBotIntent({ body: "confirmo asistencia" }), "confirm_attendance");
    assert.equal(parseBotIntent({ body: "confirmar 1" }), "confirm_attendance");
    assert.equal(parseBotIntent({ body: "no puedo asistir" }), "report_unavailability");
    assert.equal(parseBotIntent({ body: "no disponible" }), "report_unavailability");
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

  it("detects operation numeric selection", () => {
    for (const body of ["2", "2.", "opción 2", "la segunda"]) {
      assert.equal(parseBotIntent({ body }), "operation_selection", body);
    }
  });

  it("detects cancel intent", () => {
    assert.equal(parseBotIntent({ body: "Cancelar" }), "cancel");
    assert.equal(parseBotIntent({ body: "salir" }), "cancel");
  });

  it("returns unknown for unsupported text", () => {
    assert.equal(parseBotIntent({ body: "texto random" }), "unknown");
    assert.equal(parseBotIntent({ body: "no llegué" }), "unknown");
    assert.equal(parseBotIntent({ body: "" }), "unknown");
  });
});
