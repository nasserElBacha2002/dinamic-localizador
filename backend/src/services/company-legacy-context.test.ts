import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { selectDefaultBotCompanyId } from "./company-context.service";

describe("selectDefaultBotCompanyId", () => {
  const companies = [
    { id: "11111111-1111-1111-1111-111111111111", name: "Company A" },
    { id: "22222222-2222-2222-2222-222222222222", name: "Company B" },
  ];

  it("resolves a single active company without configuration", () => {
    const companyId = selectDefaultBotCompanyId([companies[0]], {});
    assert.equal(companyId, companies[0].id);
  });

  it("requires explicit configuration when multiple companies exist", () => {
    assert.throws(
      () => selectDefaultBotCompanyId(companies, {}),
      (error: unknown) =>
        error instanceof AppError && error.code === "BOT_COMPANY_SELECTION_REQUIRED",
    );
  });

  it("uses BOT_DEFAULT_COMPANY_ID when configured", () => {
    const companyId = selectDefaultBotCompanyId(companies, {
      defaultCompanyId: companies[1].id,
    });
    assert.equal(companyId, companies[1].id);
  });

  it("uses BOT_DEFAULT_COMPANY_NAME when configured", () => {
    const companyId = selectDefaultBotCompanyId(companies, {
      defaultCompanyName: "Company A",
    });
    assert.equal(companyId, companies[0].id);
  });
});
