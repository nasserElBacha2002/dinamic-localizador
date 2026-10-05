import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocationTypeSelectableForServiceClient } from "./location-type-client-scope";

describe("isLocationTypeSelectableForServiceClient", () => {
  const companyWide = { clientId: null };
  const clientA = { clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const clientB = { clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

  it("does not offer company-wide formats when a client is selected", () => {
    assert.equal(isLocationTypeSelectableForServiceClient(companyWide, clientA.clientId), false);
    assert.equal(isLocationTypeSelectableForServiceClient(clientB, clientA.clientId), false);
    assert.equal(isLocationTypeSelectableForServiceClient(clientA, clientA.clientId), true);
  });
});
