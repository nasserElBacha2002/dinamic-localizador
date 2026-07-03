import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { ALL_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const activeCompany = {
  id: "company-1",
  name: "Co",
  legalName: null,
  taxId: null,
  country: null,
  defaultTimezone: "America/Argentina/Buenos_Aires",
  status: "ACTIVE" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const now = new Date().toISOString();

const storedModules = ALL_COMPANY_MODULE_KEYS.map((moduleKey, index) => ({
  id: `module-${index}`,
  companyId: "company-1",
  moduleKey,
  isEnabled: true,
  createdAt: now,
  updatedAt: now,
}));

describe("companyModuleService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("lists all default modules for a company", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyModuleRepository } = await import("../repositories/company-module.repository");
    const { companyModuleService } = await import("./company-module.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyModuleRepository, "ensureDefaults", async () => undefined);
    mock.method(companyModuleRepository, "listByCompanyId", async () => storedModules);

    const modules = await companyModuleService.listModules("company-1");
    assert.equal(modules.length, ALL_COMPANY_MODULE_KEYS.length);
    assert.deepEqual(
      modules.map((module) => module.moduleKey),
      [...ALL_COMPANY_MODULE_KEYS],
    );
    assert.equal("id" in modules[0], false);
  });

  it("merges missing module rows with default enabled state", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyModuleRepository } = await import("../repositories/company-module.repository");
    const { companyModuleService } = await import("./company-module.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyModuleRepository, "ensureDefaults", async () => undefined);
    mock.method(companyModuleRepository, "listByCompanyId", async () =>
      storedModules.filter((module) => module.moduleKey !== "reports"),
    );

    const modules = await companyModuleService.listModules("company-1");
    const reports = modules.find((module) => module.moduleKey === "reports");
    assert.ok(reports);
    assert.equal(reports.isEnabled, true);
  });

  it("updates modules when requester is platform admin", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyModuleRepository } = await import("../repositories/company-module.repository");
    const { companyModuleService } = await import("./company-module.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyModuleRepository, "ensureDefaults", async () => undefined);
    mock.method(companyModuleRepository, "bulkSet", async () => undefined);
    mock.method(companyModuleRepository, "listByCompanyId", async () =>
      storedModules.map((module) =>
        module.moduleKey === "absences" ? { ...module, isEnabled: false } : module,
      ),
    );

    const modules = await companyModuleService.updateModules("company-1", true, {
      modules: [{ moduleKey: "absences", isEnabled: false }],
    });
    assert.equal(modules.find((module) => module.moduleKey === "absences")?.isEnabled, false);
  });

  it("rejects update when all core modules would be disabled", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyModuleRepository } = await import("../repositories/company-module.repository");
    const { companyModuleService } = await import("./company-module.service");

    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyModuleRepository, "ensureDefaults", async () => undefined);
    mock.method(companyModuleRepository, "listByCompanyId", async () => storedModules);

    await assert.rejects(
      () =>
        companyModuleService.updateModules("company-1", true, {
          modules: [
            { moduleKey: "attendance", isEnabled: false },
            { moduleKey: "inventory_operations", isEnabled: false },
            { moduleKey: "absences", isEnabled: false },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "CORE_MODULES_REQUIRED");
        return true;
      },
    );
  });

  it("rejects update when requester is not platform admin", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyModuleService } = await import("./company-module.service");

    mock.method(companyRepository, "findById", async () => activeCompany);

    await assert.rejects(
      () =>
        companyModuleService.updateModules("company-1", false, {
          modules: [{ moduleKey: "reports", isEnabled: false }],
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "PLATFORM_ADMIN_REQUIRED");
        return true;
      },
    );
  });

  it("ensures default modules for older companies", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { companyModuleRepository } = await import("../repositories/company-module.repository");
    const { companyModuleService } = await import("./company-module.service");

    let ensured = false;
    mock.method(companyRepository, "findById", async () => activeCompany);
    mock.method(companyModuleRepository, "ensureDefaults", async () => {
      ensured = true;
    });

    await companyModuleService.ensureDefaultModules("company-1");
    assert.equal(ensured, true);
  });
});
