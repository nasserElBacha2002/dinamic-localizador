import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createLocationZoneSchema } from "../schemas/location-zone.schema";
import { locationZoneGeocodingService } from "./location-zone-geocoding.service";
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
  geocodingStatus: null as null,
  geocodingSource: null as null,
  geocodedAt: null as null,
  geocodingLastError: null as null,
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

  it("marks manual centroids as MANUAL on update", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    const manualZone = {
      ...zoneFixture,
      centroidLatitude: -34.62,
      centroidLongitude: -58.44,
      geocodingStatus: "MANUAL" as const,
      geocodingSource: "MANUAL" as const,
      assignedEmployeesCount: 0,
    };
    let findCalls = 0;
    mock.method(locationZoneRepository, "findByIdForCompany", async () => {
      findCalls += 1;
      if (findCalls === 1) {
        return {
          ...zoneFixture,
          geocodingStatus: "PENDING",
          assignedEmployeesCount: 0,
        };
      }
      return manualZone;
    });
    mock.method(locationZoneRepository, "update", async (_companyId, _zoneId, input) => {
      assert.equal(input.geocodingStatus, "MANUAL");
      assert.equal(input.geocodingSource, "MANUAL");
      assert.equal(input.centroidLatitude, -34.62);
      assert.equal(input.centroidLongitude, -58.44);
      return manualZone;
    });

    const updated = await locationZoneService.update("company-a", "OWNER", "zone-1", {
      centroidLatitude: -34.62,
      centroidLongitude: -58.44,
    });
    assert.equal(updated.geocodingStatus, "MANUAL");
  });

  it("creates zone as PENDING without blocking on geocoding", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByNormalizedKey", async () => null);
    mock.method(locationZoneRepository, "create", async (_companyId, input) => {
      assert.equal(input.geocodingStatus, "PENDING");
      assert.equal(input.centroidLatitude, null);
      return {
        ...zoneFixture,
        name: input.name,
        geocodingStatus: "PENDING",
      };
    });
    mock.method(locationZoneGeocodingService, "scheduleGeocode", () => undefined);

    const created = await locationZoneService.create("company-a", "OWNER", {
      name: "Boedo",
      locality: "CABA",
    });
    assert.equal(created.geocodingStatus, "PENDING");
  });

  it("clears stale centroids when AUTO zone is renamed", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByNormalizedKey", async () => null);
    const pendingZone = {
      ...zoneFixture,
      name: "Boedo",
      normalizedName: "boedo",
      centroidLatitude: null as number | null,
      centroidLongitude: null as number | null,
      geocodingStatus: "PENDING" as const,
      geocodingSource: "AUTO" as const,
      assignedEmployeesCount: 0,
    };
    let findCalls = 0;
    mock.method(locationZoneRepository, "findByIdForCompany", async () => {
      findCalls += 1;
      if (findCalls === 1) {
        return {
          ...zoneFixture,
          centroidLatitude: -34.62,
          centroidLongitude: -58.44,
          geocodingStatus: "RESOLVED",
          geocodingSource: "AUTO",
          assignedEmployeesCount: 0,
        };
      }
      return pendingZone;
    });
    mock.method(locationZoneGeocodingService, "scheduleGeocode", () => undefined);
    mock.method(locationZoneRepository, "update", async (_c, _z, input) => {
      assert.equal(input.centroidLatitude, null);
      assert.equal(input.centroidLongitude, null);
      assert.equal(input.geocodingStatus, "PENDING");
      assert.equal(input.name, "Boedo");
      return pendingZone;
    });

    const updated = await locationZoneService.update("company-a", "OWNER", "zone-1", {
      name: "Boedo",
    });
    assert.equal(updated.geocodingStatus, "PENDING");
    assert.equal(updated.centroidLatitude, null);
  });

  it("preserves MANUAL centroids when renamed", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByNormalizedKey", async () => null);
    mock.method(locationZoneRepository, "findByIdForCompany", async () => ({
      ...zoneFixture,
      centroidLatitude: -34.62,
      centroidLongitude: -58.44,
      geocodingStatus: "MANUAL",
      geocodingSource: "MANUAL",
      assignedEmployeesCount: 0,
    }));
    mock.method(locationZoneRepository, "update", async (_c, _z, input) => {
      assert.equal(input.centroidLatitude, undefined);
      assert.equal(input.geocodingStatus, undefined);
      return {
        ...zoneFixture,
        name: "Boedo",
        centroidLatitude: -34.62,
        centroidLongitude: -58.44,
        geocodingStatus: "MANUAL",
        geocodingSource: "MANUAL",
      };
    });

    const updated = await locationZoneService.update("company-a", "OWNER", "zone-1", {
      name: "Boedo",
    });
    assert.equal(updated.geocodingStatus, "MANUAL");
    assert.equal(updated.centroidLatitude, -34.62);
  });

  it("respects force=false for MANUAL geocode", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByIdForCompany", async () => ({
      ...zoneFixture,
      geocodingStatus: "MANUAL",
      geocodingSource: "MANUAL",
      centroidLatitude: -34.6,
      centroidLongitude: -58.4,
    }));

    await assert.rejects(
      () => locationZoneService.geocode("company-a", "OWNER", "zone-1", { force: false }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_ZONE_MANUAL_OVERRIDE",
    );
  });
});
