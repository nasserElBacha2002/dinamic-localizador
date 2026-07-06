import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildArrivalRegisteredMessage,
  buildCheckoutRegisteredMessage,
  buildCheckoutRejectedMessage,
  buildLocationRequestMessage,
  buildMainMenuMessage,
  buildNoOperationMessage,
  buildOutsideRadiusMessage,
  DUPLICATE_ATTENDANCE_MESSAGE,
  GREETING_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  NO_OPERATION_MESSAGE,
} from "./bot-response.builder";

describe("bot response builders", () => {
  const operation = {
    id: "op-1",
    serviceId: "svc-1",
    serviceName: "Carrefour Caballito",
    serviceAddress: "Av. Rivadavia 5108",
    serviceLocality: "Caballito",
    scheduledStart: "2026-07-05T15:00:00.000Z",
    scheduledEnd: "2026-07-05T21:00:00.000Z",
    serviceLatitude: -34.6,
    serviceLongitude: -58.4,
    allowedRadiusMeters: 150,
    earlyToleranceMinutes: 15,
    lateToleranceMinutes: 30,
    status: "SCHEDULED",
  };

  const serviceReference = "Carrefour Caballito - Av. Rivadavia 5108 - Caballito";

  it("builds main menu message", () => {
    assert.equal(buildMainMenuMessage(), GREETING_MESSAGE);
  });

  it("builds no operation message", () => {
    assert.equal(buildNoOperationMessage(), NO_OPERATION_MESSAGE);
    assert.equal(
      NO_OPERATION_MESSAGE,
      "No encontramos un trabajo asignado para vos en la fecha y horario actuales. Verificá con administración.",
    );
  });

  it("builds location request message", () => {
    const message = buildLocationRequestMessage(operation);
    assert.match(message, /Carrefour Caballito - Av\. Rivadavia 5108 - Caballito/);
    assert.match(message, /ubicación actual/i);
  });

  it("builds arrival registered response", () => {
    const message = buildArrivalRegisteredMessage({
      compatible: operation,
      distanceMeters: 80,
      validationStatus: "VALID",
      punctualityStatus: "ON_TIME",
      validationReason: "Validación automática exitosa",
      receivedAt: new Date("2026-07-05T15:05:00.000Z"),
    });
    assert.match(message, /registrada correctamente/i);
    assert.match(message, /Carrefour Caballito - Av\. Rivadavia 5108 - Caballito/);
    assert.match(message, /Me voy/);
  });

  it("builds outside radius response", () => {
    const message = buildOutsideRadiusMessage("Distancia 250 m supera el radio permitido (150 m)");
    assert.match(message, /No pudimos validar tu llegada/);
    assert.match(message, /250 m/);
  });

  it("builds checkout rejected response", () => {
    const message = buildCheckoutRegisteredMessage({
      eligible: operation,
      checkInAt: "2026-07-05T15:00:00.000Z",
      checkoutAt: new Date("2026-07-05T21:10:00.000Z"),
      distanceMeters: 250,
      checkoutStatus: "CHECKOUT_REJECTED",
      extraWorkedMinutes: 0,
    });
    assert.equal(message, buildCheckoutRejectedMessage());
    assert.match(message, /ubicación fuera del radio permitido/);
  });

  it("builds checkout message without distance when location was not provided", () => {
    const message = buildCheckoutRegisteredMessage({
      eligible: operation,
      checkInAt: "2026-07-05T15:00:00.000Z",
      checkoutAt: new Date("2026-07-05T21:05:00.000Z"),
      distanceMeters: null,
      checkoutStatus: "CHECKOUT_VALID",
      extraWorkedMinutes: 0,
      locationProvided: false,
    });

    assert.match(message, /Ubicación: no requerida/);
    assert.doesNotMatch(message, /Distancia: 0 m/);
  });

  it("builds checkout message with distance when location was provided", () => {
    const message = buildCheckoutRegisteredMessage({
      eligible: operation,
      checkInAt: "2026-07-05T15:00:00.000Z",
      checkoutAt: new Date("2026-07-05T21:05:00.000Z"),
      distanceMeters: 42,
      checkoutStatus: "CHECKOUT_VALID",
      extraWorkedMinutes: 0,
      locationProvided: true,
    });

    assert.match(message, /Distancia: 42 m/);
  });

  it("exposes duplicate attendance message constant", () => {
    assert.equal(
      DUPLICATE_ATTENDANCE_MESSAGE,
      "Ya registraste tu llegada para este trabajo.",
    );
  });

  it("exposes invalid coordinates message constant", () => {
    assert.equal(
      INVALID_COORDINATES_MESSAGE,
      "Las coordenadas recibidas no son válidas. Volvé a compartir tu ubicación actual.",
    );
  });
});
