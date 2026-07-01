import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  DEFAULT_EARLY_TOLERANCE_MINUTES,
  DEFAULT_LATE_TOLERANCE_MINUTES,
  IMPORT_LOCATION_NOT_FOUND_MESSAGE,
  IMPORT_MISSING_DATE_MESSAGE,
  IMPORT_MISSING_LOCATION_MESSAGE,
} from "../constants/inventory-import";
import { inventoryRepository } from "../repositories/inventory.repository";
import { storeRepository } from "../repositories/store.repository";
import { inventoryImportService } from "./inventory-import.service";

const COMPANY_ID = "company-1";
const FUTURE_DATE = "01/12/2026";

const sampleStore = {
  id: "store-213",
  name: "213",
  address: "Calle 1",
  neighborhood: null,
  locality: null,
  storeFormat: null,
  latitude: -34.6,
  longitude: -58.38,
  allowedRadiusMeters: 150,
  googlePlaceId: null,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const buildCsv = (headers: string[], row: string[]): string =>
  `${headers.join(",")}\n${row.join(",")}`;

describe("inventoryImportService preview", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const mockStores = () => {
    mock.method(storeRepository, "listAllActive", async () => [sampleStore]);
    mock.method(inventoryRepository, "findExistingActiveKeys", async () => new Set());
  };

  const expectClientRow = (row: NonNullable<Awaited<ReturnType<typeof inventoryImportService.preview>>["rows"][0]>) => {
    assert.equal(row.storeId, sampleStore.id);
    assert.equal(row.earlyToleranceMinutes, DEFAULT_EARLY_TOLERANCE_MINUTES);
    assert.equal(row.lateToleranceMinutes, DEFAULT_LATE_TOLERANCE_MINUTES);
    assert.match(row.scheduledStartDisplay, /20:30 \(default\)/);
    assert.match(row.scheduledEndDisplay, /03:00 día siguiente \(default\)/);
    assert.ok(new Date(row.scheduledEnd!) > new Date(row.scheduledStart!));
    assert.equal(row.status, "valid");
  };

  it("imports legacy minimal PUNTO + Fecha", async () => {
    mockStores();
    const result = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]),
    );

    assert.equal(result.format, "client");
    assert.equal(result.rows.length, 1);
    expectClientRow(result.rows[0]);
    assert.equal(result.rows[0].punto, "213");
  });

  it("imports Sucursal + Fecha with the same result as PUNTO", async () => {
    mockStores();
    const puntoResult = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]),
    );
    const sucursalResult = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["Sucursal", "Fecha"], ["213", FUTURE_DATE]),
    );

    assert.deepEqual(
      {
        storeId: sucursalResult.rows[0]?.storeId,
        scheduledStart: sucursalResult.rows[0]?.scheduledStart,
        scheduledEnd: sucursalResult.rows[0]?.scheduledEnd,
        earlyToleranceMinutes: sucursalResult.rows[0]?.earlyToleranceMinutes,
        lateToleranceMinutes: sucursalResult.rows[0]?.lateToleranceMinutes,
      },
      {
        storeId: puntoResult.rows[0]?.storeId,
        scheduledStart: puntoResult.rows[0]?.scheduledStart,
        scheduledEnd: puntoResult.rows[0]?.scheduledEnd,
        earlyToleranceMinutes: puntoResult.rows[0]?.earlyToleranceMinutes,
        lateToleranceMinutes: puntoResult.rows[0]?.lateToleranceMinutes,
      },
    );
  });

  it("imports Ubicación + Fecha", async () => {
    mockStores();
    const result = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["Ubicación", "Fecha"], ["213", FUTURE_DATE]),
    );
    assert.equal(result.format, "client");
    expectClientRow(result.rows[0]);
  });

  it("imports Ubicacion without accent + Fecha", async () => {
    mockStores();
    const result = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["Ubicacion", "Fecha"], ["213", FUTURE_DATE]),
    );
    assert.equal(result.format, "client");
    expectClientRow(result.rows[0]);
  });

  it("imports extended tienda + fecha_inicio + fecha_fin", async () => {
    mockStores();
    const result = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(
        ["tienda", "fecha_inicio", "fecha_fin"],
        ["213", `${FUTURE_DATE} 20:30`, "02/12/2026 03:00"],
      ),
    );

    assert.equal(result.format, "legacy");
    assert.equal(result.rows[0]?.storeId, sampleStore.id);
    assert.equal(result.rows[0]?.status, "valid");
  });

  it("ignores LOCAL, Formato and PROVEEDOR columns", async () => {
    mockStores();
    const minimal = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]),
    );
    const withIgnored = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(
        ["PUNTO", "Fecha", "LOCAL", "Formato", "PROVEEDOR"],
        ["213", FUTURE_DATE, "Local X", "Express", "Proveedor Y"],
      ),
    );

    assert.deepEqual(withIgnored.rows[0]?.scheduledStart, minimal.rows[0]?.scheduledStart);
    assert.deepEqual(withIgnored.rows[0]?.scheduledEnd, minimal.rows[0]?.scheduledEnd);
    assert.deepEqual(withIgnored.rows[0]?.storeId, minimal.rows[0]?.storeId);
  });

  it("fails when location column is missing", async () => {
    mockStores();
    const result = await inventoryImportService.preview(COMPANY_ID, buildCsv(["Fecha"], [FUTURE_DATE]));
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.some((error) => error.includes(IMPORT_MISSING_LOCATION_MESSAGE)));
  });

  it("fails when date column is missing", async () => {
    mockStores();
    const result = await inventoryImportService.preview(COMPANY_ID, buildCsv(["PUNTO"], ["213"]));
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.some((error) => error.includes(IMPORT_MISSING_DATE_MESSAGE)));
  });

  it("fails when location does not exist", async () => {
    mockStores();
    const result = await inventoryImportService.preview(
      COMPANY_ID,
      buildCsv(["Sucursal", "Fecha"], ["999999", FUTURE_DATE]),
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_LOCATION_NOT_FOUND_MESSAGE));
  });
});
