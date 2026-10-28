import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocationTypeAssignableToService } from "./location-type-client-scope";

describe("isLocationTypeAssignableToService", () => {
  const companyWide = { clientId: null };
  const clientA = { clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const clientB = { clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

  it("allows company-wide formats only when the service has no client", () => {
    assert.equal(isLocationTypeAssignableToService(companyWide, null), true);
    assert.equal(isLocationTypeAssignableToService(companyWide, undefined), true);
    assert.equal(isLocationTypeAssignableToService(companyWide, ""), true);
  });

  it("rejects company-wide formats when the service belongs to a client", () => {
    assert.equal(isLocationTypeAssignableToService(companyWide, clientA.clientId), false);
  });

  it("allows only the matching client formats when the service has a client", () => {
    assert.equal(isLocationTypeAssignableToService(clientA, clientA.clientId), true);
    assert.equal(isLocationTypeAssignableToService(clientB, clientA.clientId), false);
  });

  it("rejects client-specific formats when the service has no client", () => {
    assert.equal(isLocationTypeAssignableToService(clientA, null), false);
  });
});
