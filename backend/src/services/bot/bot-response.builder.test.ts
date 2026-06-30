import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildArrivalRegisteredMessage,
  buildCheckoutRegisteredMessage,
  buildCheckoutRejectedMessage,
  buildLocationRequestMessage,
  buildMainMenuMessage,
  buildNoInventoryMessage,
  buildOutsideRadiusMessage,
  DUPLICATE_ATTENDANCE_MESSAGE,
  GREETING_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  NO_INVENTORY_MESSAGE,
} from "./bot-response.builder";

describe("bot response builders", () => {
  const inventory = {
    id: "inv-1",
    storeName: "Tienda Centro",
    scheduledStart: "2026-07-05T15:00:00.000Z",
    scheduledEnd: "2026-07-05T21:00:00.000Z",
    storeLatitude: -34.6,
    storeLongitude: -58.4,
    allowedRadiusMeters: 150,
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 30,
  };

  it("builds main menu message", () => {
    assert.equal(buildMainMenuMessage(), GREETING_MESSAGE);
  });

  it("builds no inventory message", () => {
    assert.equal(buildNoInventoryMessage(), NO_INVENTORY_MESSAGE);
    assert.equal(
      NO_INVENTORY_MESSAGE,
      "No encontramos un inventario asignado para vos en la fecha y horario actuales. Verificá con administración.",
    );
  });

  it("builds location request message", () => {
    const message = buildLocationRequestMessage(inventory);
    assert.match(message, /Tienda Centro/);
    assert.match(message, /ubicación actual/i);
  });

  it("builds arrival registered response", () => {
    const message = buildArrivalRegisteredMessage({
      compatible: inventory,
      distanceMeters: 80,
      validationStatus: "VALID",
      punctualityStatus: "ON_TIME",
      validationReason: "Validación automática exitosa",
      receivedAt: new Date("2026-07-05T15:05:00.000Z"),
    });
    assert.match(message, /registrada correctamente/i);
    assert.match(message, /Me voy/);
  });

  it("builds outside radius response", () => {
    const message = buildOutsideRadiusMessage("Distancia 250 m supera el radio permitido (150 m)");
    assert.match(message, /No pudimos validar tu llegada/);
    assert.match(message, /250 m/);
  });

  it("builds checkout rejected response", () => {
    const message = buildCheckoutRegisteredMessage({
      eligible: inventory,
      checkInAt: "2026-07-05T15:00:00.000Z",
      checkoutAt: new Date("2026-07-05T21:10:00.000Z"),
      distanceMeters: 250,
      checkoutStatus: "CHECKOUT_REJECTED",
      extraWorkedMinutes: 0,
    });
    assert.equal(message, buildCheckoutRejectedMessage());
    assert.match(message, /ubicación fuera del radio permitido/);
  });

  it("exposes duplicate attendance message constant", () => {
    assert.equal(
      DUPLICATE_ATTENDANCE_MESSAGE,
      "Ya registraste tu llegada para este inventario.",
    );
  });

  it("exposes invalid coordinates message constant", () => {
    assert.equal(
      INVALID_COORDINATES_MESSAGE,
      "Las coordenadas recibidas no son válidas. Volvé a compartir tu ubicación actual.",
    );
  });
});
