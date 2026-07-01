import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CompanyMembershipSummary } from "../types/company";

function resolveInitialCompany(
  companies: CompanyMembershipSummary[],
): CompanyMembershipSummary | null {
  if (companies.length === 0) {
    return null;
  }

  if (companies.length === 1) {
    return companies[0];
  }

  return null;
}

function membership(companyId: string, name: string): CompanyMembershipSummary {
  return {
    companyId,
    companyName: name,
    role: "OWNER",
    isDefault: false,
    status: "ACTIVE",
  };
}

describe("company selection resolution", () => {
  it("returns null when user has no companies", () => {
    assert.equal(resolveInitialCompany([]), null);
  });

  it("auto-selects when user has exactly one company", () => {
    const companies = [membership("11111111-1111-1111-1111-111111111111", "Dinamic Systems")];
    assert.equal(resolveInitialCompany(companies), companies[0]);
  });

  it("requires explicit selection when user has multiple companies", () => {
    const companies = [
      membership("11111111-1111-1111-1111-111111111111", "Company A"),
      membership("22222222-2222-2222-2222-222222222222", "Company B"),
    ];
    assert.equal(resolveInitialCompany(companies), null);
  });
});
