import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

describe("platformCompanyService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns 409 when company name already exists (pre-check)", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { platformCompanyService } = await import("./platform-company.service");

    mock.method(companyRepository, "findByName", async () => ({
      id: "company-1",
      name: "Acme",
      legalName: null,
      taxId: null,
      country: null,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await assert.rejects(
      () =>
        platformCompanyService.createCompany({
          name: "Acme",
          defaultTimezone: "America/Argentina/Buenos_Aires",
          owner: {
            name: "Owner",
            email: "owner@example.com",
            temporaryPassword: "password123",
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMPANY_NAME_ALREADY_EXISTS",
    );
  });

  it("requires temporary password for new owner users", async () => {
    setupUnitTestEnv();
    const { companyRepository } = await import("../repositories/company.repository");
    const { userRepository } = await import("../repositories/user.repository");
    const { platformCompanyService } = await import("./platform-company.service");

    mock.method(companyRepository, "findByName", async () => null);
    mock.method(userRepository, "findByEmail", async () => null);

    await assert.rejects(
      () =>
        platformCompanyService.createCompany({
          name: "New Co",
          defaultTimezone: "America/Argentina/Buenos_Aires",
          owner: {
            name: "Owner",
            email: "owner@example.com",
          },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "TEMPORARY_PASSWORD_REQUIRED",
    );
  });
});
