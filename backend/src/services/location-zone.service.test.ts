import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createLocationZoneSchema } from "../schemas/location-zone.schema";
import {
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";
import { locationZoneGeocodingService } from "./location-zone-geocoding.service";
import { locationZoneService } from "./location-zone.service";

setupUnitTestEnv();

const zoneFixture = {
  id: "zone-1",
  companyId: "company-a",
  associationId: "assoc-1",
  associationActive: true,
  globalIsActive: true,
  name: "Caballito",
  normalizedName: "caballito",
  locality: "CABA",
  normalizedLocality: "caba",
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

describe("normalizeLocationZoneName", () => {
  it("dedupes casing, spaces, and accents", () => {
    assert.equal(normalizeLocationZoneName("Caballito"), "caballito");
    assert.equal(normalizeLocationZoneName(" CABALLITO "), "caballito");
    assert.equal(normalizeLocationZoneName("San Martín"), "san martin");
    assert.equal(normalizeLocationZoneLocality(" CABA "), "caba");
  });
});

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

  it("reuses global zone and associates when key already exists", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByNormalizedKey", async () => ({
      id: zoneFixture.id,
      name: zoneFixture.name,
      normalizedName: zoneFixture.normalizedName,
      locality: zoneFixture.locality,
      normalizedLocality: zoneFixture.normalizedLocality,
      centroidLatitude: null,
      centroidLongitude: null,
      geocodingStatus: null,
      geocodingSource: null,
      geocodedAt: null,
      geocodingLastError: null,
      isActive: true,
      createdAt: zoneFixture.createdAt,
      updatedAt: zoneFixture.updatedAt,
    }));
    mock.method(locationZoneRepository, "resolveOrCreateGlobalAndAssociate", async () => zoneFixture);

    const created = await locationZoneService.create("company-a", "OWNER", {
      name: "caballito",
      locality: "CABA",
    });
    assert.equal(created.id, "zone-1");
    assert.equal(created.companyId, "company-a");
  });

  it("creates global zone once then associates for a second company", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-b",
      status: "ACTIVE",
    }));

    let resolveCalls = 0;
    mock.method(locationZoneRepository, "findByNormalizedKey", async () => {
      return resolveCalls === 0
        ? null
        : {
            id: zoneFixture.id,
            name: zoneFixture.name,
            normalizedName: zoneFixture.normalizedName,
            locality: zoneFixture.locality,
            normalizedLocality: zoneFixture.normalizedLocality,
            centroidLatitude: null,
            centroidLongitude: null,
            geocodingStatus: null,
            geocodingSource: null,
            geocodedAt: null,
            geocodingLastError: null,
            isActive: true,
            createdAt: zoneFixture.createdAt,
            updatedAt: zoneFixture.updatedAt,
          };
    });
    mock.method(locationZoneRepository, "resolveOrCreateGlobalAndAssociate", async () => {
      resolveCalls += 1;
      return {
        ...zoneFixture,
        companyId: "company-b",
        associationId: "assoc-b",
      };
    });
    mock.method(locationZoneGeocodingService, "scheduleGeocode", () => undefined);

    const first = await locationZoneService.create("company-b", "OWNER", {
      name: "Caballito",
      locality: "CABA",
    });
    assert.equal(resolveCalls, 1);
    assert.equal(first.id, "zone-1");

    const second = await locationZoneService.create("company-b", "OWNER", {
      name: " CABALLITO ",
      locality: "caba",
    });
    assert.equal(resolveCalls, 2);
    assert.equal(second.id, "zone-1");
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

  it("company admin cannot edit global name/locality", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByIdForCompany", async () => zoneFixture);

    await assert.rejects(
      () =>
        locationZoneService.update("company-a", "OWNER", "zone-1", {
          name: "Caballito Centro",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "FORBIDDEN_GLOBAL_LOCATION_EDIT",
    );
  });

  it("deactivates company association via update", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));
    mock.method(locationZoneRepository, "findByIdForCompany", async () => {
      return {
        ...zoneFixture,
        isActive: true,
        globalIsActive: true,
        associationActive: false,
        assignedEmployeesCount: 2,
      };
    });
    mock.method(locationZoneRepository, "setAssociationActive", async () => ({
      id: "assoc-1",
      companyId: "company-a",
      locationZoneId: "zone-1",
      isActive: false,
      createdAt: zoneFixture.createdAt,
      updatedAt: zoneFixture.updatedAt,
    }));

    const updated = await locationZoneService.update("company-a", "OWNER", "zone-1", {
      isActive: false,
    });
    assert.equal(updated.associationActive, false);
    assert.equal(updated.isActive, true);
  });

  it("platform admin can set manual centroids on global zone", async () => {
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
    mock.method(locationZoneRepository, "findByIdForCompany", async () => manualZone);
    mock.method(locationZoneRepository, "updateGlobal", async () => ({
      id: manualZone.id,
      name: manualZone.name,
      normalizedName: manualZone.normalizedName,
      locality: manualZone.locality,
      normalizedLocality: manualZone.normalizedLocality,
      centroidLatitude: manualZone.centroidLatitude,
      centroidLongitude: manualZone.centroidLongitude,
      geocodingStatus: manualZone.geocodingStatus,
      geocodingSource: manualZone.geocodingSource,
      geocodedAt: manualZone.geocodedAt,
      geocodingLastError: manualZone.geocodingLastError,
      isActive: true,
      createdAt: manualZone.createdAt,
      updatedAt: manualZone.updatedAt,
    }));

    const updated = await locationZoneService.update(
      "company-a",
      "OWNER",
      "zone-1",
      {
        centroidLatitude: -34.62,
        centroidLongitude: -58.44,
      },
      { isPlatformAdmin: true },
    );
    assert.equal(updated.geocodingStatus, "MANUAL");
  });

  it("rejects non-platform geocode", async () => {
    mock.method(companyRepository, "findById", async () => ({
      id: "company-a",
      status: "ACTIVE",
    }));

    await assert.rejects(
      () => locationZoneService.geocode("company-a", "OWNER", "zone-1", {}),
      (error: unknown) =>
        error instanceof AppError && error.code === "FORBIDDEN_GLOBAL_LOCATION_EDIT",
    );
  });
});
