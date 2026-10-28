import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPayrollReceiptIntent } from "./payroll-receipt-intent";

describe("isPayrollReceiptIntent", () => {
  it("matches known keywords with accent normalization", () => {
    assert.equal(isPayrollReceiptIntent("Mi recibo"), true);
    assert.equal(isPayrollReceiptIntent("mis recibos"), true);
    assert.equal(isPayrollReceiptIntent("Recibo"), true);
    assert.equal(isPayrollReceiptIntent("Recibo de sueldo"), true);
    assert.equal(isPayrollReceiptIntent("Consultar recibo"), true);
    assert.equal(isPayrollReceiptIntent("Ver recibo"), true);
  });

  it("rejects unrelated phrases", () => {
    assert.equal(isPayrollReceiptIntent("Mi jornada"), false);
    assert.equal(isPayrollReceiptIntent("hola"), false);
    assert.equal(isPayrollReceiptIntent("recibo fiscal"), true); // starts with keyword + space
  });
});
