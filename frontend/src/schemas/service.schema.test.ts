import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  serviceFormSchema,
  toNullableServiceClientId,
} from "./service.schema";

describe("serviceFormSchema clientId", () => {
  it("accepts the empty select value and converts it to null", () => {
    const parsed = serviceFormSchema.parse({
      name: "Sucursal sin cliente",
      address: "",
      neighborhood: "",
      locality: "",
      serviceFormat: "",
      latitude: -34.6,
      longitude: -58.38,
      allowedRadiusMeters: 150,
      googlePlaceId: "",
      clientId: "",
      active: true,
    });

    assert.equal(toNullableServiceClientId(parsed.clientId), null);
  });

  it("keeps a selected client UUID for create and update payloads", () => {
    const clientId = "11111111-1111-4111-8111-111111111111";
    const parsed = serviceFormSchema.parse({
      name: "Sucursal con cliente",
      address: "",
      neighborhood: "",
      locality: "",
      serviceFormat: "",
      latitude: -34.6,
      longitude: -58.38,
      allowedRadiusMeters: 150,
      googlePlaceId: "",
      clientId,
      active: true,
    });

    assert.equal(toNullableServiceClientId(parsed.clientId), clientId);
  });
});
