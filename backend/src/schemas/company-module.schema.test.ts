import assert from "node:assert/strict";
import { z } from "zod";
import { describe, it } from "node:test";
import { ALL_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { updateCompanyModulesSchema } from "../schemas/company-module.schema";

describe("updateCompanyModulesSchema", () => {
  it("accepts valid module updates", () => {
    const parsed = updateCompanyModulesSchema.parse({
      modules: [{ moduleKey: "attendance", isEnabled: true }],
    });
    assert.equal(parsed.modules.length, 1);
  });

  it("rejects invalid module key", () => {
    assert.throws(() =>
      updateCompanyModulesSchema.parse({
        modules: [{ moduleKey: "billing", isEnabled: true }],
      }),
    );
  });

  it("rejects duplicate module keys in payload", () => {
    assert.throws(() =>
      updateCompanyModulesSchema.parse({
        modules: [
          { moduleKey: "attendance", isEnabled: true },
          { moduleKey: "attendance", isEnabled: false },
        ],
      }),
    );
  });

  it("requires a non-empty modules array", () => {
    assert.throws(() => updateCompanyModulesSchema.parse({ modules: [] }));
  });

  it("covers all allowed module keys", () => {
    assert.equal(ALL_COMPANY_MODULE_KEYS.length, 5);
    for (const moduleKey of ALL_COMPANY_MODULE_KEYS) {
      const parsed = updateCompanyModulesSchema.parse({
        modules: [{ moduleKey, isEnabled: true }],
      });
      assert.equal(parsed.modules[0]?.moduleKey, moduleKey);
    }
  });
});
