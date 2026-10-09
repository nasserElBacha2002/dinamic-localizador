import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { importStrategyRegistry } from "./registry";
import { IMPORT_ENTITY_TYPES } from "./constants";
import { clientsImportStrategy } from "./strategies/clients.strategy";
import { servicesImportStrategy } from "./strategies/services.strategy";
import { employeesImportStrategy } from "./strategies/employees.strategy";

const companyId = "11111111-1111-1111-1111-111111111111";
const clientId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const serviceCsvHeader =
  "Nombre,Dirección,Barrio,Localidad,Cliente,Formato,Latitud,Longitud,Radio (metros),Google Place ID";

describe("import entity types", () => {
  it("includes clients in registry and constants", () => {
    assert.ok(IMPORT_ENTITY_TYPES.includes("clients"));
    assert.ok(importStrategyRegistry.get("clients"));
  });
});

describe("services import client column", () => {
  it("accepts valid client and rejects missing client", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { companyLocationTypesService } = await import(
      "../services/company-location-types.service"
    );

    mock.method(serviceRepository, "findExistingNames", async () => new Map());
    mock.method(companyLocationTypesService, "listLocationTypes", async () => []);
    mock.method(clientRepository, "findByNormalizedName", async (cid: string, name: string) => {
      if (name === "carrefour") {
        return {
          id: clientId,
          companyId: cid,
          name: "Carrefour",
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: null,
          updatedBy: null,
        };
      }
      return null;
    });

    const valid = await servicesImportStrategy.prepare(
      companyId,
      Buffer.from([serviceCsvHeader, `Sucursal A,,,,Carrefour,,-34.6,-58.4,150,`].join("\n"), "utf8"),
      "services.csv",
    );
    assert.equal(valid.summary.validRows, 1);
    assert.equal((valid.rows[0]?.payload as { clientId?: string })?.clientId, clientId);

    const missing = await servicesImportStrategy.prepare(
      companyId,
      Buffer.from([serviceCsvHeader, `Sucursal B,,,,Desconocido,,-34.6,-58.4,150,`].join("\n"), "utf8"),
      "services.csv",
    );
    assert.equal(missing.summary.validRows, 0);
    assert.equal(missing.rows[0]?.errors[0]?.code, "CLIENT_NOT_FOUND");
  });

  it("rejects incompatible service format for client", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    const { serviceRepository } = await import("../repositories/service.repository");
    const { companyLocationTypesService } = await import(
      "../services/company-location-types.service"
    );

    mock.method(serviceRepository, "findExistingNames", async () => new Map());
    mock.method(companyLocationTypesService, "listLocationTypes", async () => [
      { code: "EXPRESS", name: "Express", isActive: true },
    ]);
    mock.method(clientRepository, "findByNormalizedName", async () => ({
      id: clientId,
      companyId,
      name: "Carrefour",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      updatedBy: null,
    }));
    mock.method(companyLocationTypesService, "assertActiveServiceFormat", async () => {
      throw new AppError(
        400,
        "INCOMPATIBLE_LOCATION_TYPE_CLIENT",
        "El formato no es compatible con el cliente de la sucursal.",
      );
    });

    const prepared = await servicesImportStrategy.prepare(
      companyId,
      Buffer.from(
        [serviceCsvHeader, `Sucursal C,,,,Carrefour,Express,-34.6,-58.4,150,`].join("\n"),
        "utf8",
      ),
      "services.csv",
    );
    assert.equal(prepared.summary.validRows, 0);
    assert.equal(prepared.rows[0]?.errors[0]?.code, "INCOMPATIBLE_LOCATION_TYPE_CLIENT");
  });
});

describe("employees import client column", () => {
  it("resolves client into import payload", async () => {
    setupUnitTestEnv();
    const { employeeCategoryRepository } = await import(
      "../repositories/employee-category.repository"
    );
    const { employeeRepository } = await import("../repositories/employee.repository");
    const { clientRepository } = await import("../repositories/client.repository");

    mock.method(employeeCategoryRepository, "listForCompany", async () => []);
    mock.method(employeeRepository, "findExistingPhones", async () => new Set());
    mock.method(clientRepository, "findByNormalizedName", async () => ({
      id: clientId,
      companyId,
      name: "Carrefour",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: null,
      updatedBy: null,
    }));

    const prepared = await employeesImportStrategy.prepare(
      companyId,
      Buffer.from(
        [
          "Nombre,Documento,Teléfono,Tipo,Categoría,Cliente",
          `Ana Test,,+5491199990001,Fijo,,Carrefour`,
        ].join("\n"),
        "utf8",
      ),
      "employees.csv",
    );
    assert.equal(prepared.summary.validRows, 1);
    assert.deepEqual(
      (prepared.rows[0]?.payload as { clientIds?: string[] })?.clientIds,
      [clientId],
    );
  });
});

describe("clients import strategy", () => {
  it("rejects duplicate names in file and existing db names", async () => {
    setupUnitTestEnv();
    const { clientRepository } = await import("../repositories/client.repository");
    mock.method(clientRepository, "findExistingNormalizedNames", async () => new Set(["existente"]));

    const duplicateInFile = await clientsImportStrategy.prepare(
      companyId,
      Buffer.from(["Nombre", "Dup", "Dup"].join("\n"), "utf8"),
      "clients.csv",
    );
    assert.equal(duplicateInFile.summary.validRows, 1);
    assert.equal(duplicateInFile.rows[1]?.errors[0]?.code, "CLIENT_DUPLICATE_IN_FILE");

    const existsInDb = await clientsImportStrategy.prepare(
      companyId,
      Buffer.from(["Nombre", "Existente"].join("\n"), "utf8"),
      "clients.csv",
    );
    assert.equal(existsInDb.summary.validRows, 0);
    assert.equal(existsInDb.rows[0]?.errors[0]?.code, "CLIENT_NAME_ALREADY_EXISTS");
  });
});
