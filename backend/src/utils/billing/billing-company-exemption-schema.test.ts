import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UX_BCE_COMPANY_PERMANENT_OPEN_FILTER_CANONICAL,
  assertUxBceCompanyPermanentOpenIndex,
} from "./billing-company-exemption-schema";

const validIndex = {
  is_disabled: false,
  is_unique: true,
  type_desc: "NONCLUSTERED",
  filter_definition: "([is_permanent]=(1) AND [expires_at] IS NULL)",
};

describe("assertUxBceCompanyPermanentOpenIndex", () => {
  it("accepts a valid unique permanent-open index on company_id", () => {
    assert.doesNotThrow(() => assertUxBceCompanyPermanentOpenIndex(validIndex, ["company_id"]));
  });

  it("rejects a disabled index", () => {
    assert.throws(
      () =>
        assertUxBceCompanyPermanentOpenIndex(
          { ...validIndex, is_disabled: true },
          ["company_id"],
        ),
      /disabled/i,
    );
  });

  it("rejects a non-unique index", () => {
    assert.throws(
      () => assertUxBceCompanyPermanentOpenIndex({ ...validIndex, is_unique: false }, ["company_id"]),
      /not unique/i,
    );
  });

  it("rejects a filter that does not scope permanent open rows", () => {
    assert.throws(
      () =>
        assertUxBceCompanyPermanentOpenIndex(
          { ...validIndex, filter_definition: "([is_permanent]=(1))" },
          ["company_id"],
        ),
      /filter must be permanent open rows/i,
    );
  });

  it("rejects an adversarial filter that mentions both columns but is not permanent-open", () => {
    assert.throws(
      () =>
        assertUxBceCompanyPermanentOpenIndex(
          {
            ...validIndex,
            filter_definition: "([is_permanent]=(1) OR [expires_at] IS NULL)",
          },
          ["company_id"],
        ),
      /filter must be permanent open rows/i,
    );
    assert.notEqual(
      UX_BCE_COMPANY_PERMANENT_OPEN_FILTER_CANONICAL,
      "is_permanent 1 or expires_at is null",
    );
  });

  it("rejects index keys other than company_id alone", () => {
    assert.throws(
      () => assertUxBceCompanyPermanentOpenIndex(validIndex, ["company_id", "id"]),
      /company_id only/i,
    );
    assert.throws(
      () => assertUxBceCompanyPermanentOpenIndex(validIndex, ["exemption_reason"]),
      /company_id only/i,
    );
  });
});