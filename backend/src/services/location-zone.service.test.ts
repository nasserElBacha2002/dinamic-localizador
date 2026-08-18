import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createLocationZoneSchema } from "../schemas/location-zone.schema";
import { locationZoneService } from "./location-zone.service";

setupUnitTestEnv();

const zoneFixture = {
  id: "zone-1",
  companyId: "company-a",
  name: "Caballito",
  normalizedName: "caballito",
  locality: "Ciudad Autónoma de Buenos Aires",
  normalizedLocality: "ciudad autonoma de buenos aires",
  centroidLatitude: null as number | null,
  centroidLongitude: null as number | null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("createLocationZoneSchema", () => {
  it("rejects unpaired centroid coordinates", () => {
    const result = createLocationZoneSchema.safeParse({
      name: "Caballito",
      centroidLatitude: -34.6,
    });
    assert.equal(result.success, false);
  });

  it("accepts paired centroids within range", () => {
    const result = createLocationZoneSchema.safeParse({
      name: "Caballito",
      centroidLatitude: -34.62,
      centroidLongitude: -58.44,
    });
    assert.equal(result.success, true);
  });
});

describe("locationZoneService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("lists company zones", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "listForCompany", async () => [zoneFixture]);

    const result = await locationZoneService.list("company-a", { includeInactive: false });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.name, "Caballito");
  });

  it("rejects duplicate name+locality within tenant", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByNormalizedKey", async () => zoneFixture);

    await assert.rejects(
      () =>
        locationZoneService.create("company-a", "OWNER", {
          name: "Caballito",
          locality: "Ciudad Autónoma de Buenos Aires",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_ZONE_NAME_ALREADY_EXISTS",
    );
  });

  it("rejects manage without employees:manage or settings permission", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));

    await assert.rejects(
      () =>
        locationZoneService.create("company-a", "READ_ONLY", {
          name: "Flores",
        }),
      (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
    );
  });

  it("rejects assigning inactive zones via findAssignableById", async () => {
    mock.method(locationZoneRepository, "findAssignableById", async () => null);
    const zone = await locationZoneRepository.findAssignableById("company-a", "zone-inactive");
    assert.equal(zone, null);
  });

  it("deactivates a zone via update", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    let findCalls = 0;
    mock.method(locationZoneRepository, "findByIdForCompany", async () => {
      findCalls += 1;
      return {
        ...zoneFixture,
        isActive: findCalls === 1,
        assignedEmployeesCount: 2,
      };
    });
    mock.method(locationZoneRepository, "update", async () => ({
      ...zoneFixture,
      isActive: false,
    }));

    const updated = await locationZoneService.update("company-a", "OWNER", "zone-1", {
      isActive: false,
    });
    assert.equal(updated.isActive, false);
  });
});
