import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyManualCoordinates,
  applyMarkerDrag,
  applyPlaceSelection,
  hasConfirmedLocation,
  mapGoogleMapsError,
  parseGoogleAddressComponents,
  resolveInitialLocationState,
} from "./service-location";

const baseFields = {
  address: "",
  latitude: -34.6037,
  longitude: -58.3816,
  googlePlaceId: null,
  allowedRadiusMeters: 150,
};

describe("resolveInitialLocationState", () => {
  it("returns EMPTY for create mode", () => {
    assert.equal(
      resolveInitialLocationState({
        isEditMode: false,
        latitude: -34.6,
        longitude: -58.38,
        googlePlaceId: "abc",
      }),
      "EMPTY",
    );
  });

  it("returns SELECTED for edit mode with place id", () => {
    assert.equal(
      resolveInitialLocationState({
        isEditMode: true,
        latitude: -34.6,
        longitude: -58.38,
        googlePlaceId: "place-1",
      }),
      "SELECTED",
    );
  });

  it("returns MANUAL for edit mode without place id", () => {
    assert.equal(
      resolveInitialLocationState({
        isEditMode: true,
        latitude: -34.6,
        longitude: -58.38,
        googlePlaceId: "",
      }),
      "MANUAL",
    );
  });
});

describe("applyPlaceSelection", () => {
  it("updates coordinates and place id without overwriting existing name", () => {
    const result = applyPlaceSelection(
      baseFields,
      {
        googlePlaceId: "place-123",
        address: "Av. Corrientes 1234",
        displayName: "Tienda Demo",
        latitude: -34.61,
        longitude: -58.39,
      },
      "Mi tienda",
    );

    assert.equal(result.state, "SELECTED");
    assert.equal(result.fields.googlePlaceId, "place-123");
    assert.equal(result.fields.latitude, -34.61);
    assert.equal(result.fields.name, undefined);
  });

  it("fills name only when empty", () => {
    const result = applyPlaceSelection(
      baseFields,
      {
        googlePlaceId: "place-123",
        address: "Av. Corrientes 1234",
        displayName: "Tienda Demo",
        latitude: -34.61,
        longitude: -58.39,
      },
      "",
    );

    assert.equal(result.fields.name, "Tienda Demo");
  });

  it("fills neighborhood and locality from place selection", () => {
    const result = applyPlaceSelection(
      baseFields,
      {
        googlePlaceId: "place-123",
        address: "Av. Corrientes 1234",
        neighborhood: "San Nicolás",
        locality: "Buenos Aires",
        displayName: null,
        latitude: -34.61,
        longitude: -58.39,
      },
      "Mi tienda",
    );

    assert.equal(result.fields.neighborhood, "San Nicolás");
    assert.equal(result.fields.locality, "Buenos Aires");
  });
});

describe("parseGoogleAddressComponents", () => {
  it("extracts street, neighborhood and locality from components", () => {
    const parsed = parseGoogleAddressComponents("Av. Corrientes 1234, Buenos Aires, Argentina", [
      { types: ["route"], longText: "Avenida Corrientes" },
      { types: ["street_number"], longText: "1234" },
      { types: ["neighborhood"], longText: "San Nicolás" },
      { types: ["locality"], longText: "Buenos Aires" },
    ]);

    assert.equal(parsed.address, "Avenida Corrientes 1234");
    assert.equal(parsed.neighborhood, "San Nicolás");
    assert.equal(parsed.locality, "Buenos Aires");
  });

  it("falls back to formatted address when street parts are missing", () => {
    const parsed = parseGoogleAddressComponents("Some formatted address", []);

    assert.equal(parsed.address, "Some formatted address");
    assert.equal(parsed.neighborhood, "");
    assert.equal(parsed.locality, "");
  });
});

describe("applyManualCoordinates", () => {
  it("marks manual state and clears googlePlaceId", () => {
    const result = applyManualCoordinates(
      { ...baseFields, googlePlaceId: "place-1" },
      -34.7,
      -58.4,
    );

    assert.ok(result);
    assert.equal(result.state, "MANUAL");
    assert.equal(result.fields.googlePlaceId, null);
  });

  it("rejects invalid coordinates", () => {
    assert.equal(applyManualCoordinates(baseFields, 120, -58.4), null);
  });
});

describe("applyMarkerDrag", () => {
  it("updates coordinates after marker movement", () => {
    const result = applyMarkerDrag(baseFields, -34.62, -58.41);
    assert.ok(result);
    assert.equal(result.state, "MANUAL");
    assert.equal(result.fields.latitude, -34.62);
  });
});

describe("hasConfirmedLocation", () => {
  it("does not confirm SEARCHING text without selection", () => {
    assert.equal(hasConfirmedLocation("SEARCHING", -34.6, -58.38), false);
  });

  it("confirms manual valid coordinates", () => {
    assert.equal(hasConfirmedLocation("MANUAL", -34.6, -58.38), true);
  });
});

describe("mapGoogleMapsError", () => {
  it("maps missing api key", () => {
    const mapped = mapGoogleMapsError(new Error("GOOGLE_MAPS_API_KEY_MISSING"));
    assert.equal(mapped.code, "API_KEY_MISSING");
  });

  it("maps place without geometry", () => {
    const mapped = mapGoogleMapsError(new Error("PLACE_WITHOUT_GEOMETRY"));
    assert.equal(mapped.code, "PLACE_WITHOUT_GEOMETRY");
  });

  it("maps referrer restriction", () => {
    const mapped = mapGoogleMapsError(new Error("RefererNotAllowedMapError"));
    assert.equal(mapped.code, "REFERRER_NOT_ALLOWED");
  });

  it("maps load failure", () => {
    const mapped = mapGoogleMapsError(new Error("GOOGLE_MAPS_LOAD_FAILED"));
    assert.equal(mapped.code, "LOAD_FAILED");
  });

  it("maps api unavailable fallback message", () => {
    const mapped = mapGoogleMapsError(new Error("The Google Maps JavaScript API could not load."));
    assert.equal(mapped.code, "LOAD_FAILED");
  });
});
