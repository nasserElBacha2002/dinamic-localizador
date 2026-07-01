import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { selectDefaultBotCompanyId } from "../services/company-context.service";

const companies = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Dinamic Systems" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Other Co" },
];

describe("selectDefaultBotCompanyId", () => {
  it("resolves the only active company", () => {
    const companyId = selectDefaultBotCompanyId([companies[0]], {});
    assert.equal(companyId, companies[0].id);
  });

  it("throws when multiple companies exist without explicit default", () => {
    assert.throws(
      () => selectDefaultBotCompanyId(companies, {}),
      (error: unknown) =>
        error instanceof AppError && error.code === "BOT_COMPANY_SELECTION_REQUIRED",
    );
  });

  it("resolves configured default company by id", () => {
    const companyId = selectDefaultBotCompanyId(companies, {
      defaultCompanyId: companies[1].id,
    });
    assert.equal(companyId, companies[1].id);
  });

  it("resolves configured default company by name", () => {
    const companyId = selectDefaultBotCompanyId(companies, {
      defaultCompanyName: "Dinamic Systems",
    });
    assert.equal(companyId, companies[0].id);
  });

  it("rejects inactive or missing configured default company id", () => {
    assert.throws(
      () =>
        selectDefaultBotCompanyId(companies, {
          defaultCompanyId: "33333333-3333-3333-3333-333333333333",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "BOT_DEFAULT_COMPANY_INVALID",
    );
  });

  it("rejects missing configured default company name", () => {
    assert.throws(
      () =>
        selectDefaultBotCompanyId(companies, {
          defaultCompanyName: "Missing Co",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "BOT_DEFAULT_COMPANY_INVALID",
    );
  });
});
