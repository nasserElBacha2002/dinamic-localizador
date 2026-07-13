import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOperationalLocationDuplicateAuditQuery,
  buildOperationalLocationDuplicateRemediationUpdate,
  buildProposedOperationalLocationName,
} from "./operational-location-duplicate-remediation";

describe("operational location duplicate remediation", () => {
  it("builds audit query with optional company filter", () => {
    assert.match(buildOperationalLocationDuplicateAuditQuery(), /LTRIM\(RTRIM\(ol\.name\)\)/);
    assert.match(
      buildOperationalLocationDuplicateAuditQuery("11111111-1111-1111-1111-111111111111"),
      /AND ol\.company_id = @companyId/,
    );
  });

  it("builds remediation update with optional company filter", () => {
    assert.match(
      buildOperationalLocationDuplicateRemediationUpdate(),
      /duplicate_rank > 1/,
    );
    assert.match(
      buildOperationalLocationDuplicateRemediationUpdate("11111111-1111-1111-1111-111111111111"),
      /WHERE company_id = @companyId/,
    );
  });

  it("proposes deterministic rename suffixes", () => {
    assert.equal(buildProposedOperationalLocationName({
      normalizedName: "Sucursal Centro",
      duplicateRank: 1,
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }), "Sucursal Centro");
    assert.equal(buildProposedOperationalLocationName({
      normalizedName: "Sucursal Centro",
      duplicateRank: 2,
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }), "Sucursal Centro (2)");
    assert.equal(buildProposedOperationalLocationName({
      normalizedName: "Sucursal Centro",
      duplicateRank: 2,
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      nameCollisionRank: 2,
    }), "Sucursal Centro (2) #aaaaaaaa");
  });
});
