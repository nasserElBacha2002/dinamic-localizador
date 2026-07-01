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
  scopedApiPath,
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

const ACTIVE_COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-2222-2222-222222222222";

describe("scopedApiPath", () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorageMock();
    clearActiveCompanyId();
    setRuntimeCompanyId(ACTIVE_COMPANY_ID);
  });

  it("scopes operational paths with and without a leading slash", () => {
    assert.equal(
      scopedApiPath("employees"),
      `companies/${ACTIVE_COMPANY_ID}/employees`,
    );
    assert.equal(
      scopedApiPath("/employees"),
      `companies/${ACTIVE_COMPANY_ID}/employees`,
    );
  });

  it("scopes nested operational paths", () => {
    assert.equal(
      scopedApiPath("statistics/attendance/summary"),
      `companies/${ACTIVE_COMPANY_ID}/statistics/attendance/summary`,
    );
    assert.equal(
      scopedApiPath("inventories/import/preview"),
      `companies/${ACTIVE_COMPANY_ID}/inventories/import/preview`,
    );
    assert.equal(scopedApiPath("users"), `companies/${ACTIVE_COMPANY_ID}/users`);
    assert.equal(
      scopedApiPath("settings"),
      `companies/${ACTIVE_COMPANY_ID}/settings`,
    );
  });

  it("leaves global paths unchanged", () => {
    assert.equal(scopedApiPath("auth/login"), "auth/login");
    assert.equal(scopedApiPath("health"), "health");
    assert.equal(scopedApiPath("companies"), "companies");
  });

  it("leaves already company-scoped paths unchanged", () => {
    assert.equal(
      scopedApiPath(`companies/${OTHER_COMPANY_ID}/employees`),
      `companies/${OTHER_COMPANY_ID}/employees`,
    );
    assert.equal(
      scopedApiPath(`companies/${OTHER_COMPANY_ID}/settings`),
      `companies/${OTHER_COMPANY_ID}/settings`,
    );
  });

  it("throws ACTIVE_COMPANY_REQUIRED when no company is selected", () => {
    clearActiveCompanyId();
    assert.throws(() => scopedApiPath("employees"), (error: unknown) => {
      return error instanceof ActiveCompanyRequiredError && error.code === ACTIVE_COMPANY_REQUIRED;
    });
  });
});

describe("companyApiPath", () => {
  beforeEach(() => {
    storage.clear();
    installLocalStorageMock();
    clearActiveCompanyId();
  });

  it("builds a relative company-scoped path without a leading slash", () => {
    setRuntimeCompanyId(ACTIVE_COMPANY_ID);
    assert.equal(
      companyApiPath("employees"),
      `companies/${ACTIVE_COMPANY_ID}/employees`,
    );
    assert.equal(
      companyApiPath("/employees"),
      `companies/${ACTIVE_COMPANY_ID}/employees`,
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
  const GLOBAL_API_FILES = new Set([
    "auth.api.ts",
    "companies.api.ts",
    "health.api.ts",
    "client.ts",
    "scoped-client.ts",
    "company-path.ts",
  ]);

  it("does not contain direct legacy operational apiClient paths", () => {
    const apiDir = join(process.cwd(), "src/api");
    const legacyPattern =
      /apiClient\.(get|post|put|patch|delete)\(\s*["'`]\/?(employees|inventories|stores|attendance|statistics|absence-types|absence-requests|bot-simulator|users)/;

    const offenders: string[] = [];
    for (const fileName of readdirSync(apiDir)) {
      if (!fileName.endsWith(".ts") || fileName.endsWith(".test.ts")) {
        continue;
      }

      if (GLOBAL_API_FILES.has(fileName)) {
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
