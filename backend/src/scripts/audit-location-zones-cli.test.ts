import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUuid,
  parseLocationZonesAuditCliArgs,
} from "./audit-location-zones-cli";

describe("parseLocationZonesAuditCliArgs", () => {
  it("parses --json and optional company UUID", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const options = parseLocationZonesAuditCliArgs(["--json", "--company-id", id]);
    assert.equal(options.json, true);
    assert.equal(options.companyId, id);
  });

  it("rejects --company-id without value so all-company audit is not accidental", () => {
    assert.throws(
      () => parseLocationZonesAuditCliArgs(["--company-id"]),
      /Missing value for --company-id/,
    );
    assert.throws(
      () => parseLocationZonesAuditCliArgs(["--company-id", "--json"]),
      /Missing value for --company-id/,
    );
  });

  it("rejects non-UUID company ids", () => {
    assert.throws(
      () => parseLocationZonesAuditCliArgs(["--company-id", "not-a-uuid"]),
      /Invalid --company-id UUID/,
    );
    assert.equal(isUuid("not-a-uuid"), false);
  });
});
