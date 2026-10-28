import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatServiceReference } from "./format-service-reference";

describe("formatServiceReference", () => {
  it("formats full service data", () => {
    const result = formatServiceReference({
      name: "Carrefour Caballito",
      address: "Av. Rivadavia 5108",
      locality: "Caballito",
    });

    assert.equal(result, "Carrefour Caballito - Av. Rivadavia 5108 - Caballito");
  });

  it("omits missing locality", () => {
    const result = formatServiceReference({
      name: "Carrefour Caballito",
      address: "Av. Rivadavia 5108",
      locality: null,
    });

    assert.equal(result, "Carrefour Caballito - Av. Rivadavia 5108");
  });

  it("omits missing address", () => {
    const result = formatServiceReference({
      name: "Carrefour Caballito",
      address: null,
      locality: "Caballito",
    });

    assert.equal(result, "Carrefour Caballito - Caballito");
  });

  it("returns name only when address and locality are missing", () => {
    const result = formatServiceReference({
      name: "Carrefour Caballito",
      address: null,
      locality: null,
    });

    assert.equal(result, "Carrefour Caballito");
  });

  it("treats blank values as missing", () => {
    const result = formatServiceReference({
      name: "Carrefour Caballito",
      address: "   ",
      locality: "",
    });

    assert.equal(result, "Carrefour Caballito");
  });

  it("prevents duplicate locality values", () => {
    const result = formatServiceReference({
      name: "Carrefour Caballito",
      address: "Caballito",
      locality: "Caballito",
    });

    assert.equal(result, "Carrefour Caballito - Caballito");
  });
});
