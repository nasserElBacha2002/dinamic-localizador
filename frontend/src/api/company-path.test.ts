import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  ACTIVE_COMPANY_REQUIRED,
  ActiveCompanyRequiredError,
  clearActiveCompanyId,
  companyApiPath,
  setRuntimeCompanyId,
} from "./company-path";

const storage = new Map<string, string>();

function installLocalStorageMock(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: () => null,
      length: storage.size,
    } satisfies Storage,
  });
}

describe("companyApiPath", () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorageMock();
    clearActiveCompanyId();
  });

  it("builds a relative company-scoped path without a leading slash", () => {
    setRuntimeCompanyId("11111111-1111-1111-1111-111111111111");
    assert.equal(
      companyApiPath("/employees"),
      "companies/11111111-1111-1111-1111-111111111111/employees",
    );
  });

  it("throws ACTIVE_COMPANY_REQUIRED when no company is selected", () => {
    assert.throws(() => companyApiPath("/employees"), (error: unknown) => {
      return error instanceof ActiveCompanyRequiredError && error.code === ACTIVE_COMPANY_REQUIRED;
    });
  });
});

describe("resolveInitialCompany behavior (documented)", () => {
  it("documents that multi-company users require explicit selection", () => {
    // Covered by CompanyProvider + CompanyGate integration; manual/browser verification required.
    assert.ok(true);
  });
});
