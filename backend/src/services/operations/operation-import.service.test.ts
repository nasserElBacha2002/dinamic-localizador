import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import * as XLSX from "xlsx";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../../constants/company-settings";
import {
  IMPORT_LOCATION_NOT_FOUND_MESSAGE,
  IMPORT_MISSING_DATE_MESSAGE,
  IMPORT_MISSING_LOCATION_MESSAGE,
  IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE,
  IMPORT_RECURRING_DUPLICATE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE,
  RECURRING_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
} from "../../constants/operation-import";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { serviceRepository } from "../../repositories/locations/service.repository";
import { companyWorkScheduleRepository } from "../../repositories/companies/company-work-schedule.repository";
import { companyShiftTemplateRepository } from "../../repositories/companies/company-shift-template.repository";
import { companyOperationalDefaultsResolver } from "../companies/company-operational-defaults.resolver";
import { companyLocationTypesService } from "../companies/company-location-types.service";
import { operationsImportStrategy } from "../../imports/strategies/operations.strategy";
import { operationImportService } from "./operation-import.service";
import { operationService } from "./operation.service";
import { AppError } from "../../errors/app-error";
import { WEEKDAYS } from "../../constants/weekday";
import {
  collapseRecurringMultiShiftConfirmRows,
  IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_MIXED_MODE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_DUPLICATE_MESSAGE,
} from "../../utils/operations/operation-import-multi-shift";

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

const sampleService = {
  id: "service-213",
  name: "213",
  address: "Calle 1",
  neighborhood: null,
  locality: null,
  serviceFormat: null,
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

describe("operationImportService preview", () => {
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

  const mockServices = () => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => []);
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
    operationImportService.previewFile(COMPANY_ID, buildCsvBuffer(headers, row), CSV_FILE_NAME);

  const previewXlsx = (headers: string[], row: string[]) =>
    operationImportService.previewFile(COMPANY_ID, buildXlsxBuffer(headers, row), XLSX_FILE_NAME);

  const expectClientRow = (
    row: NonNullable<Awaited<ReturnType<typeof operationImportService.previewFile>>["rows"][0]>,
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

    assert.equal(row.serviceId, sampleService.id);
    assert.equal(row.earlyToleranceMinutes, early);
    assert.equal(row.lateToleranceMinutes, late);
    assert.equal(row.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(row.lateToleranceSource, "COMPANY_DEFAULT");
    assert.match(row.scheduledStartDisplay, startPattern);
    assert.match(row.scheduledEndDisplay, endPattern);
    assert.ok(new Date(row.scheduledEnd!) > new Date(row.scheduledStart!));
    assert.equal(row.status, "valid");
  };

  it("imports legacy minimal PUNTO + Fecha", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);

    assert.equal(result.format, "client");
    assert.equal(result.fileType, "csv");
    assert.equal(result.rows.length, 1);
    expectClientRow(result.rows[0]);
    assert.equal(result.rows[0].punto, "213");
  });

  it("uses company import defaults once per preview request", async () => {
    mockServices();
    const resolver = mockImportDefaults();
    await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(resolver.getResolverCalls(), 1);
  });

  it("resolves service names only within the authenticated company scope", async () => {
    let listedCompanyId: string | null = null;
    mock.method(serviceRepository, "listAllActive", async (companyId: string) => {
      listedCompanyId = companyId;
      return [sampleService];
    });
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => []);
    mockLocationTypes();
    mockImportDefaults();

    const result = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(listedCompanyId, COMPANY_ID);
    assert.equal(result.rows[0]?.serviceId, sampleService.id);
    assert.equal(result.rows[0]?.status, "valid");
  });

  it("does not resolve a service name that belongs only to another company", async () => {
    mock.method(serviceRepository, "listAllActive", async (companyId: string) => {
      assert.equal(companyId, COMPANY_ID);
      return [];
    });
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => []);
    mockLocationTypes();
    mockImportDefaults();

    const result = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_LOCATION_NOT_FOUND_MESSAGE));
  });

  it("uses company-specific schedule and tolerances when configured", async () => {
    mockServices();
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
    mockServices();
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
    assert.equal(result.rows[0]?.earlyToleranceSource, "CUSTOM");
    assert.equal(result.rows[0]?.lateToleranceSource, "CUSTOM");
  });

  it("keeps explicit zero spreadsheet tolerances as custom overrides", async () => {
    mockServices();
    mockImportDefaults();

    const result = await previewCsv(
      ["PUNTO", "Fecha", "tolerancia_temprana", "tolerancia_tardia"],
      ["213", FUTURE_DATE, "0", "0"],
    );

    assert.equal(result.rows[0]?.earlyToleranceSource, "CUSTOM");
    assert.equal(result.rows[0]?.lateToleranceSource, "CUSTOM");
  });

  it("imports Sucursal + Fecha with the same result as PUNTO", async () => {
    mockServices();
    mockImportDefaults();
    const puntoResult = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const sucursalResult = await previewCsv(["Sucursal", "Fecha"], ["213", FUTURE_DATE]);

    assert.deepEqual(
      {
        serviceId: sucursalResult.rows[0]?.serviceId,
        scheduledStart: sucursalResult.rows[0]?.scheduledStart,
        scheduledEnd: sucursalResult.rows[0]?.scheduledEnd,
        earlyToleranceMinutes: sucursalResult.rows[0]?.earlyToleranceMinutes,
        lateToleranceMinutes: sucursalResult.rows[0]?.lateToleranceMinutes,
      },
      {
        serviceId: puntoResult.rows[0]?.serviceId,
        scheduledStart: puntoResult.rows[0]?.scheduledStart,
        scheduledEnd: puntoResult.rows[0]?.scheduledEnd,
        earlyToleranceMinutes: puntoResult.rows[0]?.earlyToleranceMinutes,
        lateToleranceMinutes: puntoResult.rows[0]?.lateToleranceMinutes,
      },
    );
  });

  it("imports Ubicación + Fecha", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(["Ubicación", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(result.format, "client");
    expectClientRow(result.rows[0]);
  });

  it("imports Ubicacion without accent + Fecha", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(["Ubicacion", "Fecha"], ["213", FUTURE_DATE]);
    assert.equal(result.format, "client");
    expectClientRow(result.rows[0]);
  });

  it("imports Sucursal + Fecha from XLSX", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewXlsx(["Sucursal", "Fecha"], ["213", FUTURE_DATE]);

    assert.equal(result.format, "client");
    assert.equal(result.fileType, "xlsx");
    expectClientRow(result.rows[0]);
  });

  it("imports extended legacy location column + fecha_inicio + fecha_fin", async () => {
    mockServices();
    mockImportDefaults();
    const legacyLocationHeader = "ti" + "enda";
    const result = await previewCsv(
      [legacyLocationHeader, "fecha_inicio", "fecha_fin"],
      ["213", `${FUTURE_DATE} 20:30`, "02/12/2026 03:00"],
    );

    assert.equal(result.format, "legacy");
    assert.equal(result.rows[0]?.serviceId, sampleService.id);
    assert.equal(result.rows[0]?.status, "valid");
  });

  it("accepts optional Formato when it matches an active company location type", async () => {
    mockServices();
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
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, "Unknown Type"],
    );

    assert.equal(result.rows[0]?.status, "invalid");
  });

  it("ignores empty Formato values", async () => {
    mockServices();
    mockImportDefaults();
    const minimal = await previewCsv(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const withEmptyFormat = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, ""],
    );

    assert.equal(withEmptyFormat.rows[0]?.status, "valid");
    assert.deepEqual(withEmptyFormat.rows[0]?.serviceId, minimal.rows[0]?.serviceId);
  });

  it("accepts dynamic company location type codes such as WAREHOUSE", async () => {
    mockServices();
    mockImportDefaults();
    mockLocationTypes(["Express", "WAREHOUSE"]);

    const result = await previewCsv(
      ["PUNTO", "Fecha", "Formato"],
      ["213", FUTURE_DATE, "WAREHOUSE"],
    );

    assert.equal(result.rows[0]?.status, "valid");
  });

  it("fails when location column is missing", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(["Fecha"], [FUTURE_DATE]);
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.some((error) => error.includes(IMPORT_MISSING_LOCATION_MESSAGE)));
  });

  it("fails when date column is missing", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(["PUNTO"], ["213"]);
    assert.equal(result.format, null);
    assert.ok(result.fileErrors.some((error) => error.includes(IMPORT_MISSING_DATE_MESSAGE)));
  });

  it("fails when location does not exist", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewCsv(["Sucursal", "Fecha"], ["999999", FUTURE_DATE]);
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_LOCATION_NOT_FOUND_MESSAGE));
  });
});

describe("operationImportService confirm", () => {
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

  const mockServices = () => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => []);
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

  it("prepared import strategy payload carries inherited provenance for confirm", async () => {
    mockServices();
    mockImportDefaults({
      earlyToleranceMinutes: 55,
      lateToleranceMinutes: 85,
    });

    const buffer = buildCsvBuffer(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const preview = await operationImportService.previewFile(
      COMPANY_ID,
      buffer,
      CSV_FILE_NAME,
    );
    const prepared = await operationsImportStrategy.prepare(COMPANY_ID, buffer, CSV_FILE_NAME);
    const payload = prepared.rows[0]?.payload;

    assert.equal(preview.rows[0]?.earlyToleranceMinutes, 55);
    assert.equal(preview.rows[0]?.lateToleranceMinutes, 85);
    assert.equal(preview.rows[0]?.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(preview.rows[0]?.lateToleranceSource, "COMPANY_DEFAULT");
    assert.equal(payload?.earlyToleranceMinutes, 55);
    assert.equal(payload?.lateToleranceMinutes, 85);
    assert.equal(payload?.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(payload?.lateToleranceSource, "COMPANY_DEFAULT");
    assert.match(preview.rows[0]?.scheduledStartDisplay ?? "", /\(default\)/);
  });
});

describe("operationImportService recurring preview", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const mockLocationTypes = () => {
    mock.method(companyLocationTypesService, "listLocationTypes", async () => []);
  };

  const mockServices = (hasCompanySchedule = true) => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () =>
      hasCompanySchedule
        ? {
            id: "schedule-1",
            companyId: COMPANY_ID,
            timezone: defaultImportDefaults.operationTimezone,
            days: WEEKDAYS.map((dayOfWeek, index) => ({
              dayOfWeek,
              isEnabled: index < 5,
              startTime: "09:00",
              endTime: "18:00",
            })),
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }
        : null,
    );
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => []);
    mockLocationTypes();
  };

  const mockImportDefaults = () => {
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => defaultImportDefaults);
  };

  const recurringHeaders = [
    ...RECURRING_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
  ];

  const validRecurringRow = [
    "213",
    "01/12/2026",
    "",
    "20:30",
    "03:00",
    "1",
    "1",
    "1",
    "1",
    "1",
    "0",
    "0",
    "CUSTOM",
  ];

  it("imports a valid RECURRING row with custom schedule", async () => {
    mockServices();
    mockImportDefaults();
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, validRecurringRow),
      CSV_FILE_NAME,
    );

    const row = result.rows[0];
    assert.equal(result.format, "recurring");
    assert.equal(row?.operationKind, "RECURRING");
    assert.equal(row?.status, "valid");
    assert.equal(row?.validFrom, "2026-12-01");
    assert.equal(row?.scheduleSource, "CUSTOM");
    assert.equal(row?.scheduleTimezone, defaultImportDefaults.operationTimezone);
    assert.equal(row?.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.match(row?.scheduledEndDisplay ?? "", /día siguiente/);
  });

  it("builds the same recurring create shape as manual API input", async () => {
    mockServices();
    mockImportDefaults();
    const preview = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, validRecurringRow),
      CSV_FILE_NAME,
    );
    const prepared = await operationsImportStrategy.prepare(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, validRecurringRow),
      CSV_FILE_NAME,
    );
    const payload = prepared.rows[0]?.payload;

    assert.ok(payload);
    assert.equal((payload as { operationKind?: string }).operationKind, "RECURRING");
    assert.equal((payload as { validFrom?: string }).validFrom, preview.rows[0]?.validFrom);
    assert.equal((payload as { scheduleSource?: string }).scheduleSource, "CUSTOM");
    assert.ok(Array.isArray((payload as { scheduleDays?: unknown }).scheduleDays));
  });

  it("rejects invalid vigencia range", async () => {
    mockServices();
    mockImportDefaults();
    const row = [...validRecurringRow];
    row[1] = "10/12/2026";
    row[2] = "01/12/2026";
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
  });

  it("rejects rows without active weekdays for CUSTOM schedule", async () => {
    mockServices();
    mockImportDefaults();
    const row = [...validRecurringRow];
    row[5] = "0";
    row[6] = "0";
    row[7] = "0";
    row[8] = "0";
    row[9] = "0";
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
  });

  it("accepts overnight schedules", async () => {
    mockServices();
    mockImportDefaults();
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, validRecurringRow),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "valid");
    assert.match(result.rows[0]?.scheduledEndDisplay ?? "", /03:00 \(día siguiente\)/);
  });

  it("does not resolve services outside the company", async () => {
    mock.method(serviceRepository, "listAllActive", async () => []);
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => []);
    mockLocationTypes();
    mockImportDefaults();

    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, validRecurringRow),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_LOCATION_NOT_FOUND_MESSAGE));
  });

  it("rejects COMPANY rows that include custom schedule columns", async () => {
    mockServices();
    mockImportDefaults();
    const row = [...validRecurringRow];
    row[12] = "COMPANY";
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(
      result.rows[0]?.errors.includes(IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE),
    );
  });

  it("rejects COMPANY when lunes is explicitly 0", async () => {
    mockServices();
    mockImportDefaults();
    const row = ["213", "01/12/2026", "", "", "", "0", "", "", "", "", "", "", "COMPANY"];
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE));
  });

  it("rejects COMPANY when lunes is explicitly false", async () => {
    mockServices();
    mockImportDefaults();
    const row = ["213", "01/12/2026", "", "", "", "false", "", "", "", "", "", "", "COMPANY"];
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE));
  });

  it("rejects COMPANY when lunes is explicitly enabled", async () => {
    mockServices();
    mockImportDefaults();
    const row = ["213", "01/12/2026", "", "", "", "1", "", "", "", "", "", "", "COMPANY"];
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE));
  });

  it("accepts COMPANY when no custom schedule values are provided", async () => {
    mockServices(true);
    mockImportDefaults();
    const row = ["213", "01/12/2026", "", "", "", "", "", "", "", "", "", "", "COMPANY"];
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "valid");
    assert.equal(result.rows[0]?.scheduleSource, "COMPANY");
  });

  it("keeps CUSTOM day flags for disabled weekdays", async () => {
    mockServices();
    mockImportDefaults();
    const row = ["213", "01/12/2026", "", "09:00", "18:00", "0", "1", "0", "0", "0", "0", "0", "CUSTOM"];
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, row),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "valid");
    assert.equal(result.rows[0]?.scheduleDays?.filter((day) => day.isEnabled).length, 1);
    assert.equal(result.rows[0]?.scheduleDays?.find((day) => day.dayOfWeek === "MONDAY")?.isEnabled, false);
    assert.equal(result.rows[0]?.scheduleDays?.find((day) => day.dayOfWeek === "TUESDAY")?.isEnabled, true);
  });

  it("marks retry duplicates as invalid when the recurring operation already exists", async () => {
    mockServices();
    mockImportDefaults();
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () =>
      new Set([`${sampleService.id}|2026-12-01`]),
    );

    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(recurringHeaders, validRecurringRow),
      CSV_FILE_NAME,
    );
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_RECURRING_DUPLICATE_MESSAGE));
  });

  it("keeps ONE_TIME client import regression", async () => {
    mockServices();
    mockImportDefaults();
    const result = await operationImportService.previewFile(
      COMPANY_ID,
      buildCsvBuffer(["PUNTO", "Fecha"], ["213", FUTURE_DATE]),
      CSV_FILE_NAME,
    );
    assert.equal(result.format, "client");
    assert.equal(result.rows[0]?.operationKind, "ONE_TIME");
    assert.equal(result.rows[0]?.status, "valid");
  });
});

describe("operationImportService recurring confirm", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns persisted operations when workday sync fails after commit", async () => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => defaultImportDefaults);
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () => new Set());
    mock.method(operationService, "createRecurringImportBatch", async () => ({
      operations: [
        {
          id: "operation-1",
          serviceId: sampleService.id,
          operationKind: "RECURRING",
          scheduleMode: "SINGLE",
          scheduledStart: null,
          scheduledEnd: null,
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          earlyToleranceSource: "COMPANY_DEFAULT",
          lateToleranceSource: "COMPANY_DEFAULT",
          status: "SCHEDULED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      workdaySyncError: new AppError(
        503,
        "RECURRING_WORKDAY_SYNC_FAILED",
        "La configuración se guardó, pero no se pudieron actualizar las jornadas programadas. Podés volver a sincronizarlas desde la operación.",
      ),
    }));

    const result = await operationImportService.confirm(COMPANY_ID, [
      {
        operationKind: "RECURRING",
        serviceId: sampleService.id,
        validFrom: "2026-12-01",
        validUntil: null,
        scheduleSource: "CUSTOM",
        scheduleDays: WEEKDAYS.map((dayOfWeek, index) => ({
          dayOfWeek,
          isEnabled: index < 5,
          startTime: "20:30",
          endTime: "03:00",
        })),
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        earlyToleranceSource: "COMPANY_DEFAULT",
        lateToleranceSource: "COMPANY_DEFAULT",
      },
    ]);

    assert.equal(result.count, 1);
    assert.ok(result.workdaySyncError);
    assert.equal(result.workdaySyncError?.code, "RECURRING_WORKDAY_SYNC_FAILED");
  });

  it("rejects confirm when an active recurring operation already exists", async () => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => defaultImportDefaults);
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () =>
      new Set([`${sampleService.id}|2026-12-01`]),
    );

    await assert.rejects(
      () =>
        operationImportService.confirm(COMPANY_ID, [
          {
            operationKind: "RECURRING",
            serviceId: sampleService.id,
            validFrom: "2026-12-01",
            validUntil: null,
            scheduleSource: "CUSTOM",
            scheduleDays: WEEKDAYS.map((dayOfWeek, index) => ({
              dayOfWeek,
              isEnabled: index < 5,
              startTime: "20:30",
              endTime: "03:00",
            })),
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
          },
        ]),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "OPERATION_DUPLICATE",
    );
  });
});

describe("operationImportService recurring MULTI_SHIFT preview", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const mockLocationTypes = () => {
    mock.method(companyLocationTypesService, "listLocationTypes", async () => []);
  };

  const sampleTemplate = {
    id: "template-1",
    companyId: COMPANY_ID,
    code: "MANANA",
    name: "Mañana",
    startTime: "06:00",
    endTime: "14:00",
    sortOrder: 1,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const mockServices = (templates = [sampleTemplate]) => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => ({
      id: "schedule-1",
      companyId: COMPANY_ID,
      timezone: defaultImportDefaults.operationTimezone,
      days: WEEKDAYS.map((dayOfWeek, index) => ({
        dayOfWeek,
        isEnabled: index < 5,
        startTime: "09:00",
        endTime: "18:00",
      })),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    mock.method(companyShiftTemplateRepository, "listByCompanyId", async () => templates);
    mockLocationTypes();
  };

  const mockImportDefaults = () => {
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => defaultImportDefaults);
  };

  const multiShiftHeaders = [
    ...RECURRING_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
    "modo_horario",
    "turno_codigo",
    "turno_nombre",
    "plantilla_turno",
  ];

  const buildMultiShiftRow = (input: {
    shiftCode: string;
    shiftName?: string;
    start?: string;
    end?: string;
    validFrom?: string;
    validUntil?: string;
    template?: string;
    weekdays?: string[];
  }): string[] => [
    "213",
    input.validFrom ?? "01/12/2026",
    input.validUntil ?? "",
    input.start ?? "09:00",
    input.end ?? "18:00",
    ...(input.weekdays ?? ["1", "1", "1", "1", "1", "0", "0"]),
    "",
    "MULTI_SHIFT",
    input.shiftCode,
    input.shiftName ?? input.shiftCode,
    input.template ?? "",
  ];

  const previewRows = async (rows: string[][]) => {
    const buffer = Buffer.from(
      `${multiShiftHeaders.join(",")}\n${rows.map((row) => row.join(",")).join("\n")}`,
      "utf8",
    );
    return operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
  };

  it("groups two shift rows into one valid multi-shift operation", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA", start: "06:00", end: "14:00" }),
      buildMultiShiftRow({ shiftCode: "TARDE", start: "14:00", end: "22:00" }),
    ]);

    assert.equal(result.summary.validRows, 2);
    assert.equal(result.summary.canConfirm, true);
    assert.equal(result.rows[0]?.scheduleMode, "MULTI_SHIFT");
    assert.equal(result.rows[0]?.multiShiftGroupKey, `${sampleService.id}|2026-12-01|MULTI_SHIFT`);
    assert.equal(result.rows[1]?.multiShiftGroupKey, result.rows[0]?.multiShiftGroupKey);
  });

  it("accepts three shift rows for the same operation", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "A" }),
      buildMultiShiftRow({ shiftCode: "B", start: "14:00", end: "18:00" }),
      buildMultiShiftRow({ shiftCode: "C", start: "18:00", end: "22:00" }),
    ]);
    assert.equal(result.summary.validRows, 3);
    assert.ok(new Set(result.rows.map((row) => row.multiShiftGroupKey)).size === 1);
  });

  it("groups rows regardless of order", async () => {
    mockServices();
    mockImportDefaults();
    const ordered = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA" }),
      buildMultiShiftRow({ shiftCode: "TARDE", start: "14:00", end: "22:00" }),
    ]);
    const shuffled = await previewRows([
      buildMultiShiftRow({ shiftCode: "TARDE", start: "14:00", end: "22:00" }),
      buildMultiShiftRow({ shiftCode: "MANANA" }),
    ]);
    assert.deepEqual(
      ordered.rows.map((row) => row.shiftCode).sort(),
      shuffled.rows.map((row) => row.shiftCode).sort(),
    );
    assert.equal(ordered.rows[0]?.multiShiftGroupKey, shuffled.rows[0]?.multiShiftGroupKey);
  });

  it("keeps two distinct multi-shift operations in the same file", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA", validFrom: "01/12/2026" }),
      buildMultiShiftRow({ shiftCode: "TARDE", validFrom: "01/12/2026", start: "14:00", end: "22:00" }),
      buildMultiShiftRow({ shiftCode: "MANANA", validFrom: "01/01/2027" }),
      buildMultiShiftRow({ shiftCode: "TARDE", validFrom: "01/01/2027", start: "14:00", end: "22:00" }),
    ]);
    const groupKeys = new Set(result.rows.map((row) => row.multiShiftGroupKey));
    assert.equal(groupKeys.size, 2);
    assert.equal(result.summary.validRows, 4);
  });

  it("accepts overnight shift times", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "NOCHE", start: "22:00", end: "06:00" }),
    ]);
    assert.equal(result.rows[0]?.status, "valid");
    assert.match(result.rows[0]?.scheduledStartDisplay ?? "", /día siguiente/);
  });

  it("rejects unknown shift templates", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA", template: "00000000-0000-4000-8000-000000000099" }),
    ]);
    assert.equal(result.rows[0]?.status, "invalid");
    assert.ok(result.rows[0]?.errors.includes(IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE));
  });

  it("rejects duplicate shift codes within the same operation", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA" }),
      buildMultiShiftRow({ shiftCode: "MANANA", start: "14:00", end: "22:00" }),
    ]);
    assert.equal(result.rows.some((row) => row.status === "invalid"), true);
    assert.ok(
      result.rows.some((row) =>
        row.errors.includes(IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_DUPLICATE_MESSAGE),
      ),
    );
  });

  it("invalidates the whole group when one shift row is invalid", async () => {
    mockServices();
    mockImportDefaults();
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA" }),
      buildMultiShiftRow({
        shiftCode: "TARDE",
        start: "14:00",
        end: "22:00",
        weekdays: ["0", "0", "0", "0", "0", "0", "0"],
      }),
    ]);
    assert.equal(result.rows.every((row) => row.status === "invalid"), true);
  });

  it("rejects mixing SINGLE and MULTI_SHIFT for the same operation key", async () => {
    mockServices();
    mockImportDefaults();
    const singleRow = [
      "213",
      "01/12/2026",
      "",
      "20:30",
      "03:00",
      "1",
      "1",
      "1",
      "1",
      "1",
      "0",
      "0",
      "CUSTOM",
      "SINGLE",
      "",
      "",
      "",
    ];
    const result = await previewRows([
      buildMultiShiftRow({ shiftCode: "MANANA" }),
      singleRow,
    ]);
    assert.ok(
      result.rows.some((row) =>
        row.errors.includes(IMPORT_RECURRING_MULTI_SHIFT_MIXED_MODE_MESSAGE),
      ),
    );
  });

  it("collapse confirm rows preserves one operation per multi-shift group (ordering is applied later server-side)", () => {
    const collapsed = collapseRecurringMultiShiftConfirmRows([
      {
        operationKind: "RECURRING",
        scheduleMode: "MULTI_SHIFT",
        serviceId: sampleService.id,
        validFrom: "2026-12-01",
        validUntil: null,
        scheduleSource: "COMPANY",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        shift: {
          code: "MANANA",
          name: "Mañana",
          sortOrder: 2,
          startTime: "06:00",
          endTime: "14:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      },
      {
        operationKind: "RECURRING",
        scheduleMode: "MULTI_SHIFT",
        serviceId: sampleService.id,
        validFrom: "2026-12-01",
        validUntil: null,
        scheduleSource: "COMPANY",
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        shift: {
          code: "TARDE",
          name: "Tarde",
          sortOrder: 1,
          startTime: "14:00",
          endTime: "22:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      },
    ]);

    assert.equal(collapsed.length, 1);
    assert.equal(collapsed[0]?.scheduleMode, "MULTI_SHIFT");
    assert.equal(collapsed[0]?.shifts?.length, 2);
    const codes = collapsed[0]?.shifts?.map((shift) => shift.code).sort();
    assert.deepEqual(codes, ["MANANA", "TARDE"]);
  });
});

describe("operationImportService recurring MULTI_SHIFT confirm", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects inconsistent multi-shift groups before persistence", async () => {
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => defaultImportDefaults);

    await assert.rejects(
      () =>
        operationImportService.confirm(COMPANY_ID, [
          {
            operationKind: "RECURRING",
            scheduleMode: "MULTI_SHIFT",
            serviceId: sampleService.id,
            validFrom: "2026-12-01",
            validUntil: null,
            scheduleSource: "COMPANY",
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
            shift: {
              code: "MANANA",
              name: "Mañana",
              sortOrder: 0,
              startTime: "06:00",
              endTime: "14:00",
              days: [{ dayOfWeek: 1, isEnabled: true }],
            },
          },
          {
            operationKind: "RECURRING",
            scheduleMode: "MULTI_SHIFT",
            serviceId: sampleService.id,
            validFrom: "2026-12-01",
            validUntil: "2026-12-31",
            scheduleSource: "COMPANY",
            earlyToleranceMinutes: 15,
            lateToleranceMinutes: 15,
            earlyToleranceSource: "COMPANY_DEFAULT",
            lateToleranceSource: "COMPANY_DEFAULT",
            shift: {
              code: "TARDE",
              name: "Tarde",
              sortOrder: 1,
              startTime: "14:00",
              endTime: "22:00",
              days: [{ dayOfWeek: 1, isEnabled: true }],
            },
          },
        ]),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "OPERATION_IMPORT_INVALID" &&
        error.message === IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
    );
  });
});

