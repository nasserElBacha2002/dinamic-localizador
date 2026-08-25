import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { friendlyGeocodingErrorMessage } from "./geocoding-error-message";

describe("friendlyGeocodingErrorMessage", () => {
  it("maps known provider codes", () => {
    assert.equal(
      friendlyGeocodingErrorMessage("ZERO_RESULTS"),
      "No se encontró una ubicación compatible.",
    );
    assert.equal(
      friendlyGeocodingErrorMessage("REJECTED_COUNTRY: BR"),
      "La ubicación encontrada no pertenece a Argentina.",
    );
    assert.equal(
      friendlyGeocodingErrorMessage("REJECTED_BOUNDS"),
      "La ubicación encontrada no es válida para Argentina.",
    );
    assert.equal(
      friendlyGeocodingErrorMessage("OVER_QUERY_LIMIT"),
      "El servicio de geocodificación está temporalmente limitado.",
    );
    assert.equal(
      friendlyGeocodingErrorMessage("HTTP 429"),
      "El servicio de geocodificación está temporalmente limitado.",
    );
  });

  it("falls back for empty or unknown technical detail", () => {
    assert.equal(
      friendlyGeocodingErrorMessage(null),
      "No se pudieron resolver las coordenadas.",
    );
    assert.equal(
      friendlyGeocodingErrorMessage("Google Geocoding API status REQUEST_DENIED"),
      "No se pudieron resolver las coordenadas.",
    );
  });
});
