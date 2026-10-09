import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { resolveImportClientReference } from "./resolve-import-client";

const companyId = "11111111-1111-1111-1111-111111111111";
const clientId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("resolveImportClientReference", () => {
  it("returns null client for empty value", async () => {
    setupUnitTestEnv();
    const result = await resolveImportClientReference(companyId, "   ");
    assert.equal(result.clientId, null);
    assert.equal(result.error, null);
  });

  it("resolves active client by UUID", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    mock.method(clientRepository, "findById", async () => ({
      id: clientId,
      companyId,
      name: "Carrefour",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      updatedBy: null,
    }));

    const result = await resolveImportClientReference(companyId, clientId);
    assert.equal(result.clientId, clientId);
    assert.equal(result.error, null);
  });

  it("rejects inactive client", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    mock.method(clientRepository, "findByNormalizedName", async () => ({
      id: clientId,
      companyId,
      name: "Inactivo",
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      updatedBy: null,
    }));

    const result = await resolveImportClientReference(companyId, "Inactivo");
    assert.equal(result.clientId, null);
    assert.equal(result.error?.code, "CLIENT_INACTIVE");
  });
});
