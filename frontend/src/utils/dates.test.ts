import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dateInputToIsoEnd, dateInputToIsoStart } from "./dates";

describe("dateInputToIsoStart", () => {
  it("converts Argentina local start of day to UTC", () => {
    assert.equal(dateInputToIsoStart("2026-06-25"), "2026-06-25T03:00:00.000Z");
  });

  it("handles month boundaries without shifting to previous month", () => {
    assert.equal(dateInputToIsoStart("2026-06-24"), "2026-06-24T03:00:00.000Z");
    assert.equal(dateInputToIsoStart("2026-07-01"), "2026-07-01T03:00:00.000Z");
  });

  it("handles year boundaries without shifting to previous year", () => {
    assert.equal(dateInputToIsoStart("2026-01-01"), "2026-01-01T03:00:00.000Z");
    assert.equal(dateInputToIsoStart("2025-12-31"), "2025-12-31T03:00:00.000Z");
  });

  it("rejects invalid date input", () => {
    assert.throws(() => dateInputToIsoStart(""), /Formato de fecha inválido/);
    assert.throws(() => dateInputToIsoStart("25-06-2026"), /Formato de fecha inválido/);
  });

  it("rejects impossible calendar dates", () => {
    assert.throws(() => dateInputToIsoStart("2026-13-01"), /Fecha inválida/);
    assert.throws(() => dateInputToIsoStart("2026-00-10"), /Fecha inválida/);
    assert.throws(() => dateInputToIsoStart("2026-02-31"), /Fecha inválida/);
    assert.throws(() => dateInputToIsoStart("2026-99-99"), /Fecha inválida/);
  });
});

describe("dateInputToIsoEnd", () => {
  it("converts Argentina local end of day to UTC", () => {
    assert.equal(dateInputToIsoEnd("2026-06-25"), "2026-06-26T02:59:00.000Z");
  });

  it("handles month and year boundaries", () => {
    assert.equal(dateInputToIsoEnd("2026-06-30"), "2026-07-01T02:59:00.000Z");
    assert.equal(dateInputToIsoEnd("2025-12-31"), "2026-01-01T02:59:00.000Z");
  });

  it("rejects impossible calendar dates", () => {
    assert.throws(() => dateInputToIsoEnd("2026-13-01"), /Fecha inválida/);
    assert.throws(() => dateInputToIsoEnd("2026-00-10"), /Fecha inválida/);
    assert.throws(() => dateInputToIsoEnd("2026-02-31"), /Fecha inválida/);
    assert.throws(() => dateInputToIsoEnd("2026-99-99"), /Fecha inválida/);
  });
});
