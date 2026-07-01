import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it, beforeEach } from "node:test";
import {
  ACTIVE_COMPANY_REQUIRED,
  ActiveCompanyRequiredError,
  clearActiveCompanyId,
  companyApiPath,
  isLegacyOperationalApiPath,
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
      companyApiPath("employees"),
      "companies/11111111-1111-1111-1111-111111111111/employees",
    );
    assert.equal(
      companyApiPath("/employees"),
      "companies/11111111-1111-1111-1111-111111111111/employees",
    );
  });

  it("uses explicit companyId override", () => {
    assert.equal(
      companyApiPath("employees", "22222222-2222-2222-2222-222222222222"),
      "companies/22222222-2222-2222-2222-222222222222/employees",
    );
  });

  it("throws ACTIVE_COMPANY_REQUIRED when no company is selected", () => {
    assert.throws(() => companyApiPath("employees"), (error: unknown) => {
      return error instanceof ActiveCompanyRequiredError && error.code === ACTIVE_COMPANY_REQUIRED;
    });
  });
});

describe("isLegacyOperationalApiPath", () => {
  it("detects legacy flat operational paths", () => {
    assert.equal(isLegacyOperationalApiPath("employees"), true);
    assert.equal(isLegacyOperationalApiPath("inventories?page=1"), true);
    assert.equal(isLegacyOperationalApiPath("companies/uuid/employees"), false);
  });
});

describe("operational API audit", () => {
  it("does not contain direct legacy operational apiClient paths", () => {
    const apiDir = join(process.cwd(), "src/api");
    const legacyPattern =
      /apiClient\.(get|post|put|patch|delete)\(\s*["'`]\/?(employees|inventories|stores|attendance|statistics|absence-types|absence-requests|bot-simulator)/;

    const offenders: string[] = [];
    for (const fileName of readdirSync(apiDir)) {
      if (!fileName.endsWith(".ts") || fileName.endsWith(".test.ts")) {
        continue;
      }

      const content = readFileSync(join(apiDir, fileName), "utf8");
      if (legacyPattern.test(content)) {
        offenders.push(fileName);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Legacy operational API routes found in: ${offenders.join(", ")}`,
    );
  });
});
