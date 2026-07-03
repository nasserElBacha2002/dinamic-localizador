import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import * as XLSX from "xlsx";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import {
  IMPORT_LOCATION_NOT_FOUND_MESSAGE,
  IMPORT_MISSING_DATE_MESSAGE,
  IMPORT_MISSING_LOCATION_MESSAGE,
} from "../constants/inventory-import";
import { inventoryRepository } from "../repositories/inventory.repository";
import { storeRepository } from "../repositories/store.repository";
import { companyOperationalDefaultsResolver } from "./company-operational-defaults.resolver";
import { companyLocationTypesService } from "./company-location-types.service";
import { inventoryImportService } from "./inventory-import.service";

const COMPANY_ID = "company-1";
const FUTURE_DATE = "01/12/2026";
const CSV_FILE_NAME = "import.csv";
const XLSX_FILE_NAME = "import.xlsx";

const defaultImportDefaults = {
  companyId: COMPANY_ID,
  earlyToleranceMinutes: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
  lateToleranceMinutes: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
  operationTimezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
  defaultOperationStartTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
  defaultOperationEndTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
  geofenceReviewMarginMeters: 30,
  source: "operational_defaults" as const,
  timezoneSource: "operational_defaults" as const,
  geofenceReviewMarginSource: "environment" as const,
};

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

const buildCsvBuffer = (headers: string[], row: string[]): Buffer =>
  Buffer.from(`${headers.join(",")}\n${row.join(",")}`, "utf8");

const buildXlsxBuffer = (headers: string[], row: string[]): Buffer => {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, row]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Import");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
};

describe("inventoryImportService preview", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const mockLocationTypes = (codes: string[] = ["Express"]) => {
    mock.method(companyLocationTypesService, "listLocationTypes", async () =>
      codes.map((code, index) => ({
        id: `type-${index}`,
        companyId: COMPANY_ID,
        code,
        name: code,
        isActive: true,
        sortOrder: index + 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    );
  };

  const mockStores = () => {
    mock.method(storeRepository, "listAllActive", async () => [sampleStore]);
    mock.method(inventoryRepository, "findExistingActiveKeys", async () => new Set());
    mockLocationTypes();
  };

  const mockImportDefaults = (
    overrides: Partial<typeof defaultImportDefaults> = {},
  ) => {
    let resolverCalls = 0;
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async (companyId) => {
      resolverCalls += 1;
      assert.equal(companyId, COMPANY_ID);
      return {
        ...defaultImportDefaults,
        ...overrides,
      };
    });
    return {
      getResolverCalls: () => resolverCalls,
    };
  };

  const previewCsv = (headers: string[], row: string[]) =>
    inventoryImportService.previewFile(COMPANY_ID, buildCsvBuffer(headers, row), CSV_FILE_NAME);

  const previewXlsx = (headers: string[], row: string[]) =>
    inventoryImportService.previewFile(COMPANY_ID, buildXlsxBuffer(headers, row), XLSX_FILE_NAME);

  const expectClientRow = (
    row: NonNullable<Awaited<ReturnType<typeof inventoryImportService.previewFile>>["rows"][0]>,
    options?: {
      earlyToleranceMinutes?: number;
      lateToleranceMinutes?: number;
      startDisplayPattern?: RegExp;
      endDisplayPattern?: RegExp;
    },
  ) => {
    const early = options?.earlyToleranceMinutes ?? defaultImportDefaults.earlyToleranceMinutes;
    const late = options?.lateToleranceMinutes ?? defaultImportDefaults.lateToleranceMinutes;
    const startPattern = options?.startDisplayPattern ?? /20:30 \(default\)/;
    const endPattern = options?.endDisplayPattern ?? /03:00 día siguiente \(default\)/;

    assert.equal(row.storeId, sampleStore.id);
    assert.equal(row.earlyToleranceMinutes, early);
    assert.equal(row.lateToleranceMinutes, late);
    assert.match(row.scheduledStartDisplay, startPattern);
    assert.match(row.scheduledEndDisplay, endPattern);
    assert.ok(new Date(row.scheduledEnd!) > new Date(row.scheduledStart!));
    assert.equal(row.status, "valid");
  };

  it("imports legacy minimal PUNTO + Fecha", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);

    assert.equal(result.format, "client");
    assert.equal(result.fileType, "csv");
    assert.equal(result.rows.length, 1);
    expectClientRow(result.rows[0]);
    assert.equal(result.rows[0].punto, "213");
  });

  it("uses company import defaults once per preview request", async () => {
    mockStores();
    const resolver = mockImportDefaults();
    await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(resolver.getResolverCalls(), 1);
  });

  it("uses company-specific schedule and tolerances when configured", async () => {
    mockStores();
    mockImportDefaults({
      earlyToleranceMinutes: 55,
      lateToleranceMinutes: 85,
      defaultOperationStartTime: "21:15",
      defaultOperationEndTime: "04:30",
      source: "company_settings",
    });

    const result = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    expectClientRow(result.rows[0], {
      earlyToleranceMinutes: 55,
      lateToleranceMinutes: 85,
      startDisplayPattern: /21:15 \(default\)/,
      endDisplayPattern: /04:30 día siguiente \(default\)/,
    });
  });

  it("keeps explicit spreadsheet tolerances over company defaults", async () => {
    mockStores();
    mockImportDefaults({
      earlyToleranceMinutes: 55,
      lateToleranceMinutes: 85,
    });

    const result = await previewCsv(
      ["PUNTO", "Fecha", "tolerancia_temprana", "tolerancia_tardia"],
      ["213", FUTURE_DATE, "12", "18"],
    );

    assert.equal(result.rows[0]?.earlyToleranceMinutes, 12);
    assert.equal(result.rows[0]?.lateToleranceMinutes, 18);
  });

  it("imports Sucursal + Fecha with the same result as PUNTO", async () => {
    mockStores();
    mockImportDefaults();
    const puntoResult = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const sucursalResult = await previewCsv(["Sucursal", "Fecha"], ["213", FUTURE_DATE]);

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
    mockImportDefaults();
    const result = await previewCsv(["Ubicación", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(result.format, "client");
    expectClientRow(result.rows[0]);
  });

  it("imports Ubicacion without accent + Fecha", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(["Ubicacion", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(result.format, "client");
    expectClientRow(result.rows[0]);
  });

  it("imports Sucursal + Fecha from XLSX", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewXlsx(["Sucursal", "Fecha"], ["213", FUTURE_DATE]);

    assert.equal(result.format, "client");
    assert.equal(result.fileType, "xlsx");
    expectClientRow(result.rows[0]);
  });

  it("imports extended tienda + fecha_inicio + fecha_fin", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(
      ["tienda", "fecha_inicio", "fecha_fin"],
      ["213", `${FUTURE_DATE} 20:30`, "02/12/2026 03:00"],
    );

    assert.equal(result.format, "legacy");
    assert.equal(result.rows[0]?.storeId, sampleStore.id);
    assert.equal(result.rows[0]?.status, "valid");
  });

  it("accepts optional Formato when it matches an active company location type", async () => {
    mockStores();
    mockImportDefaults();
    const minimal = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const withFormat = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, "Express"],
    );

    assert.deepEqual(withFormat.rows[0]?.scheduledStart, minimal.rows[0]?.scheduledStart);
    assert.equal(withFormat.rows[0]?.status, "valid");
  });

  it("rejects unknown Formato values", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, "Unknown Type"],
    );

    assert.equal(result.rows[0]?.status, "invalid");
  });

  it("ignores empty Formato values", async () => {
    mockStores();
    mockImportDefaults();
    const minimal = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const withEmptyFormat = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, ""],
    );

    assert.equal(withEmptyFormat.rows[0]?.status, "valid");
    assert.deepEqual(withEmptyFormat.rows[0]?.storeId, minimal.rows[0]?.storeId);
  });

  it("accepts dynamic company location type codes such as WAREHOUSE", async () => {
    mockStores();
    mockImportDefaults();
    mockLocationTypes(["Express", "WAREHOUSE"]);

    const result = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, "WAREHOUSE"],
    );

    assert.equal(result.rows[0]?.status, "valid");
  });

  it("fails when location column is missing", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(["Fecha"], [FUTURE_DATE]);
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.some((error) => error.includes(IMPORT_MISSING_LOCATION_MESSAGE)));
  });

  it("fails when date column is missing", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(["PUNTO"], ["213"]);
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.some((error) => error.includes(IMPORT_MISSING_DATE_MESSAGE)));
  });

  it("fails when location does not exist", async () => {
    mockStores();
    mockImportDefaults();
    const result = await previewCsv(["Sucursal", "Fecha"], ["999999", FUTURE_DATE]);
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_LOCATION_NOT_FOUND_MESSAGE));
  });
});

describe("inventoryImportService confirm", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const mockLocationTypes = () => {
    mock.method(companyLocationTypesService, "listLocationTypes", async () => [
      {
        id: "type-1",
        companyId: COMPANY_ID,
        code: "Express",
        name: "Express",
        isActive: true,
        sortOrder: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  };

  const mockStores = () => {
    mock.method(storeRepository, "listAllActive", async () => [sampleStore]);
    mock.method(inventoryRepository, "findExistingActiveKeys", async () => new Set());
    mockLocationTypes();
  };

  const mockImportDefaults = (
    overrides: Partial<typeof defaultImportDefaults> = {},
  ) => {
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async (companyId) => {
      assert.equal(companyId, COMPANY_ID);
      return {
        ...defaultImportDefaults,
        ...overrides,
      };
    });
  };

  it("preview output matches confirm payload tolerances without a second defaults resolution", async () => {
    mockStores();
    mockImportDefaults({
      earlyToleranceMinutes: 55,
      lateToleranceMinutes: 85,
    });

    const preview = await inventoryImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(["PUNTO", "Fecha"], ["213", FUTURE_DATE]),
      CSV_FILE_NAME,
    );
    const confirmRows = preview.rows
      .filter((row) => row.status === "valid")
      .map((row) => ({
        storeId: row.storeId!,
        scheduledStart: row.scheduledStart!,
        scheduledEnd: row.scheduledEnd!,
        earlyToleranceMinutes: row.earlyToleranceMinutes!,
        lateToleranceMinutes: row.lateToleranceMinutes!,
        notes: null,
      }));

    assert.equal(confirmRows[0]?.earlyToleranceMinutes, 55);
    assert.equal(confirmRows[0]?.lateToleranceMinutes, 85);
    assert.match(preview.rows[0]?.scheduledStartDisplay ?? "", /\(default\)/);
  });
});
