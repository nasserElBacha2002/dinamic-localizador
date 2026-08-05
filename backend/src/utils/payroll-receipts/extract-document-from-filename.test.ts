import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractAndValidateDocumentFromFilename,
  isValidCuilChecksum,
  maskDocumentForLog,
  normalizeEmployeeDocument,
  normalizeToElevenDigits,
} from "./extract-document-from-filename";

/** Known-valid CUIL (checksum OK): 20-12345678-6 */
const VALID_CUIL = "20123456786";
const VALID_CUIL_DASHED = "20-12345678-6";

describe("isValidCuilChecksum", () => {
  it("accepts a known-valid 11-digit CUIL", () => {
    assert.equal(isValidCuilChecksum(VALID_CUIL), true);
  });

  it("rejects wrong length", () => {
    assert.equal(isValidCuilChecksum("2012345678"), false);
    assert.equal(isValidCuilChecksum("201234567861"), false);
  });

  it("rejects bad checksum", () => {
    assert.equal(isValidCuilChecksum("20123456780"), false);
    assert.equal(isValidCuilChecksum("11111111111"), false);
  });

  it("rejects non-digits", () => {
    assert.equal(isValidCuilChecksum("20-1234567"), false);
  });
});

describe("normalizeEmployeeDocument / normalizeToElevenDigits", () => {
  it("normalizes dashed and spaced values to 11 digits", () => {
    assert.equal(normalizeToElevenDigits("20-12345678-6"), VALID_CUIL);
    assert.equal(normalizeToElevenDigits("20 12345678 6"), VALID_CUIL);
    assert.equal(normalizeToElevenDigits("20.12345678.6"), VALID_CUIL);
    assert.equal(normalizeEmployeeDocument("20-12345678-6"), VALID_CUIL);
  });

  it("returns null for empty / wrong length", () => {
    assert.equal(normalizeEmployeeDocument(null), null);
    assert.equal(normalizeEmployeeDocument(""), null);
    assert.equal(normalizeEmployeeDocument("123"), null);
    assert.equal(normalizeToElevenDigits("1234567890"), null);
  });
});

describe("maskDocumentForLog", () => {
  it("shows only last 4 digits", () => {
    assert.equal(maskDocumentForLog(VALID_CUIL), "****6786");
    assert.equal(maskDocumentForLog(null), "****");
  });
});

describe("extractAndValidateDocumentFromFilename", () => {
  it("extracts plain 11 digits", () => {
    const result = extractAndValidateDocumentFromFilename(`recibo_${VALID_CUIL}.pdf`);
    assert.deepEqual(result, {
      outcome: "success",
      normalizedDocument: VALID_CUIL,
      detectedRaw: VALID_CUIL,
    });
  });

  it("extracts dashed CUIL", () => {
    const result = extractAndValidateDocumentFromFilename(`sueldo_${VALID_CUIL_DASHED}.pdf`);
    assert.equal(result.outcome, "success");
    if (result.outcome === "success") {
      assert.equal(result.normalizedDocument, VALID_CUIL);
      assert.equal(result.detectedRaw, VALID_CUIL_DASHED);
    }
  });

  it("extracts CUIL with spaces", () => {
    const result = extractAndValidateDocumentFromFilename("liq_20 12345678 6_enero.pdf");
    assert.equal(result.outcome, "success");
    if (result.outcome === "success") {
      assert.equal(result.normalizedDocument, VALID_CUIL);
    }
  });

  it("returns not_found when no CUIL-shaped token", () => {
    assert.deepEqual(extractAndValidateDocumentFromFilename("recibo_enero_2024.pdf"), {
      outcome: "not_found",
    });
  });

  it("returns invalid on bad checksum", () => {
    const result = extractAndValidateDocumentFromFilename("recibo_20123456780.pdf");
    assert.equal(result.outcome, "invalid");
  });

  it("returns ambiguous when two distinct valid CUILs", () => {
    // 27-12345678-0 (checksum OK) — distinct from VALID_CUIL
    const second = "27123456780";
    assert.equal(isValidCuilChecksum(second), true, "fixture second CUIL must be valid");
    const result = extractAndValidateDocumentFromFilename(
      `recibo_${VALID_CUIL}_y_${second}.pdf`,
    );
    assert.equal(result.outcome, "ambiguous");
  });

  it("handles uppercase .PDF extension", () => {
    const result = extractAndValidateDocumentFromFilename(`RECIBO_${VALID_CUIL}.PDF`);
    assert.equal(result.outcome, "success");
  });

  it("handles long descriptive names", () => {
    const result = extractAndValidateDocumentFromFilename(
      `Recibo_de_sueldo_empleado_Juan_Perez_${VALID_CUIL_DASHED}_periodo_2024_03_final.pdf`,
    );
    assert.equal(result.outcome, "success");
    if (result.outcome === "success") {
      assert.equal(result.normalizedDocument, VALID_CUIL);
    }
  });

  it("treats same CUIL in plain and dashed form as one success", () => {
    const result = extractAndValidateDocumentFromFilename(
      `x_${VALID_CUIL}_y_${VALID_CUIL_DASHED}.pdf`,
    );
    assert.equal(result.outcome, "success");
  });
});
