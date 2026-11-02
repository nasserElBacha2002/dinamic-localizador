import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { WEEKDAYS } from "../constants/weekday";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import {
  CLIENT_IMPORT_IGNORED_HEADERS,
  LEGACY_IMPORT_TEMPLATE_HEADERS,
  OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS,
  OPERATION_CANONICAL_TEMPLATE_FILE_NAME,
  OPERATION_IMPORT_TEMPLATE_VARIANTS,
  OPERATION_ONE_TIME_DOWNLOAD_TEMPLATE_HEADERS,
  OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS,
  OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS,
} from "../constants/operation-import";
import { AppError } from "../errors/app-error";
import { mapHeadersToColumns } from "./column-mapper";
import { importOrchestrator } from "./orchestrator";
import { importStrategyRegistry } from "./registry";
import { CLIENT_IMPORT_COLUMNS } from "./strategies/clients.strategy";
import { EMPLOYEE_IMPORT_COLUMNS } from "./strategies/employees.strategy";
import {
  buildOperationImportTemplate,
  operationsImportStrategy,
} from "./strategies/operations.strategy";
import { SERVICE_IMPORT_COLUMNS } from "./strategies/services.strategy";
import type { ImportColumnDefinition } from "./types";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { companyOperationalDefaultsResolver } from "../services/companies/company-operational-defaults.resolver";
import { companyLocationTypesService } from "../services/companies/company-location-types.service";
import { companyShiftTemplateRepository } from "../repositories/companies/company-shift-template.repository";
import { companyWorkScheduleRepository } from "../repositories/companies/company-work-schedule.repository";
import { operationRepository } from "../repositories/operations/operation.repository";
import { serviceRepository } from "../repositories/locations/service.repository";
import { operationImportService } from "../services/operations/operation-import.service";
import {
  mapImportHeaders,
  resolveImportHeaderColumn,
} from "../utils/operations/operation-import-headers";

const FUTURE_DATE = "01/12/2026";
const CSV_FILE_NAME = "import.csv";

const parseTemplateHeaders = (body: Buffer): string[] => {
  const firstLine = body.toString("utf8").split(/\r?\n/)[0] ?? "";
  return firstLine.split(",").map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, '"'));
};

const templateDataLines = (body: Buffer): string[] =>
  body
    .toString("utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.length > 0);

const buildCsvFromTemplate = (templateBody: Buffer, dataRows: string[][]): Buffer => {
  const headers = parseTemplateHeaders(templateBody);
  const lines = [
    headers.join(","),
    ...dataRows.map((row) => {
      assert.equal(row.length, headers.length, "data row must align with downloaded template headers");
      return row.join(",");
    }),
  ];
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
};

const buildRowFromTemplate = (
  headers: readonly string[],
  values: Record<string, string>,
): string[] => headers.map((header) => values[header] ?? "");

const assertColumnTemplateContract = (
  headers: string[],
  columns: ImportColumnDefinition[],
): void => {
  const expectedHeaders = columns.map((column) => column.header);
  assert.deepEqual(headers, expectedHeaders);

  const mapped = mapHeadersToColumns(headers, columns);
  assert.equal(mapped.missingRequired.length, 0);
  assert.equal(mapped.unknownHeaders.length, 0);
  assert.equal(mapped.duplicateHeaders.length, 0);

  for (const column of columns) {
    assert.ok(
      mapped.mapped[column.key] !== undefined,
      `expected parser to map column key ${column.key}`,
    );
  }
};

const assertOperationHeadersRecognized = (headers: readonly string[]): void => {
  for (const header of headers) {
    const resolved = resolveImportHeaderColumn(header);
    assert.notEqual(resolved, "");
    assert.ok(
      !["local", "proveedor"].includes(resolved),
      `obsolete ignored header leaked: ${header}`,
    );
  }
};

describe("import downloadable template contract", () => {
  for (const strategy of importStrategyRegistry.list()) {
    it(`${strategy.entityType} buildTemplate returns a non-empty csv`, () => {
      const template = strategy.buildTemplate();
      assert.ok(template.fileName.endsWith(".csv"));
      assert.ok(template.body.length > 0);
      const lines = template.body.toString("utf8").split(/\r?\n/).filter((line) => line.length > 0);
      assert.ok(lines.length >= 1, "template should include a header row");
    });
  }

  it("clients template headers match import columns", () => {
    const template = importStrategyRegistry.get("clients").buildTemplate();
    assertColumnTemplateContract(parseTemplateHeaders(template.body), CLIENT_IMPORT_COLUMNS);
  });

  it("employees template headers match import columns", () => {
    const template = importStrategyRegistry.get("employees").buildTemplate();
    assertColumnTemplateContract(parseTemplateHeaders(template.body), EMPLOYEE_IMPORT_COLUMNS);
  });

  it("services template headers match import columns", () => {
    const template = importStrategyRegistry.get("services").buildTemplate();
    assertColumnTemplateContract(parseTemplateHeaders(template.body), SERVICE_IMPORT_COLUMNS);
  });

  for (const variant of OPERATION_IMPORT_TEMPLATE_VARIANTS) {
    it(`operations legacy ${variant} template has headers only and matches constants`, () => {
      const template = buildOperationImportTemplate(variant);
      assert.deepEqual(templateDataLines(template.body), []);
      const headers = parseTemplateHeaders(template.body);
      assertOperationHeadersRecognized(headers);

      if (variant === "one_time") {
        assert.deepEqual(headers, [...OPERATION_ONE_TIME_DOWNLOAD_TEMPLATE_HEADERS]);
        const mapped = mapImportHeaders(headers);
        assert.equal(mapped.format, "client");
        assert.equal(mapped.fileErrors.length, 0);
      }

      if (variant === "recurring_single") {
        assert.deepEqual(headers, [...OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS]);
        const mapped = mapImportHeaders(headers);
        assert.equal(mapped.format, "recurring");
        assert.equal(mapped.fileErrors.length, 0);
      }

      if (variant === "recurring_multi_shift") {
        assert.deepEqual(headers, [...OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS]);
        assert.ok(!headers.includes("origen_horario"));
        assert.ok(!headers.includes("Fecha"));
        const mapped = mapImportHeaders(headers);
        assert.equal(mapped.format, "recurring");
        assert.equal(mapped.fileErrors.length, 0);
      }

      for (const ignored of CLIENT_IMPORT_IGNORED_HEADERS) {
        assert.ok(!headers.includes(ignored));
      }
    });
  }

  it("operations canonical template has headers only and is detected as canonical format", () => {
    const template = buildOperationImportTemplate();
    assert.equal(template.fileName, OPERATION_CANONICAL_TEMPLATE_FILE_NAME);
    assert.deepEqual(templateDataLines(template.body), []);
    const headers = parseTemplateHeaders(template.body);
    assert.deepEqual(headers, [...OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS]);
    assertOperationHeadersRecognized(headers);
    const mapped = mapImportHeaders(headers);
    assert.equal(mapped.format, "canonical");
    assert.equal(mapped.fileErrors.length, 0);
  });

  it("legacy import headers remain accepted", () => {
    const mapped = mapImportHeaders([...LEGACY_IMPORT_TEMPLATE_HEADERS]);
    assert.equal(mapped.format, "legacy");
    assert.equal(mapped.fileErrors.length, 0);
  });

  it("operations template download serves canonical by default and keeps legacy variants", () => {
    const canonicalTemplate = buildOperationImportTemplate();
    const withoutVariant = importOrchestrator.getTemplate("operations");
    assert.equal(withoutVariant.fileName, canonicalTemplate.fileName);
    assert.equal(withoutVariant.body.toString("utf8"), canonicalTemplate.body.toString("utf8"));

    const oneTimeTemplate = buildOperationImportTemplate("one_time");
    const withOneTimeVariant = importOrchestrator.getTemplate("operations", "one_time");
    assert.equal(withOneTimeVariant.fileName, oneTimeTemplate.fileName);
    assert.deepEqual(
      parseTemplateHeaders(withOneTimeVariant.body),
      parseTemplateHeaders(oneTimeTemplate.body),
    );

    const recurringSingle = importOrchestrator.getTemplate("operations", "recurring_single");
    assert.deepEqual(parseTemplateHeaders(recurringSingle.body), [
      ...OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS,
    ]);

    const recurringMultiShift = importOrchestrator.getTemplate("operations", "recurring_multi_shift");
    assert.deepEqual(parseTemplateHeaders(recurringMultiShift.body), [
      ...OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS,
    ]);

    assert.throws(
      () => importOrchestrator.getTemplate("operations", "not-a-variant"),
      (error: unknown) =>
        error instanceof AppError && error.code === "IMPORT_TEMPLATE_VARIANT_INVALID",
    );
  });

  it("non-operations entities download templates without variant", () => {
    for (const entityType of ["clients", "employees", "services"] as const) {
      const template = importOrchestrator.getTemplate(entityType);
      assert.ok(template.fileName.endsWith(".csv"));
      assert.ok(parseTemplateHeaders(template.body).length > 0);
    }
  });
});

describe("operations template preview contract", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const COMPANY_ID = "company-template-test";
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

  const mockImportContext = (options?: { withCompanyWorkSchedule?: boolean }) => {
    setupUnitTestEnv();
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => ({
      companyId: COMPANY_ID,
      earlyToleranceMinutes:
        DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultEarlyArrivalToleranceMinutes,
      lateToleranceMinutes: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultLateArrivalToleranceMinutes,
      operationTimezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
      defaultOperationStartTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationStartTime,
      defaultOperationEndTime: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultOperationEndTime,
      geofenceReviewMarginMeters: 30,
      source: "operational_defaults" as const,
      timezoneSource: "operational_defaults" as const,
      geofenceReviewMarginSource: "environment" as const,
    }));
    mock.method(serviceRepository, "listAllActive", async () => [sampleService]);
    mock.method(operationRepository, "findExistingActiveKeys", async () => new Set());
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () => new Set());
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () =>
      options?.withCompanyWorkSchedule
        ? {
            id: "schedule-1",
            companyId: COMPANY_ID,
            timezone: DEFAULT_COMPANY_OPERATIONAL_SETTINGS.operationTimezone,
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
    mock.method(companyLocationTypesService, "listLocationTypes", async () => []);
  };

  it("ONE_TIME downloaded template accepts a user row without removing columns", async () => {
    mockImportContext();
    const template = buildOperationImportTemplate("one_time");
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Fecha: FUTURE_DATE,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.format, "client");
    assert.equal(preview.rows.length, 1);
    assert.equal(preview.rows[0]?.operationKind, "ONE_TIME");
    assert.equal(preview.rows[0]?.status, "valid");
    assert.equal(preview.summary.canConfirm, true);
  });

  it("RECURRING SINGLE downloaded template reaches valid preview", async () => {
    mockImportContext();
    const template = buildOperationImportTemplate("recurring_single");
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        vigencia_desde: FUTURE_DATE,
        horario_inicio: "09:00",
        horario_fin: "18:00",
        lunes: "1",
        martes: "1",
        miercoles: "1",
        jueves: "1",
        viernes: "1",
        sabado: "0",
        domingo: "0",
        origen_horario: "CUSTOM",
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.format, "recurring");
    assert.equal(preview.rows.length, 1);
    assert.equal(preview.rows[0]?.operationKind, "RECURRING");
    assert.equal(preview.rows[0]?.scheduleMode, "SINGLE");
    assert.equal(preview.rows[0]?.status, "valid");
    assert.equal(preview.summary.canConfirm, true);
  });

  it("RECURRING MULTI_SHIFT downloaded template reaches valid preview", async () => {
    mockImportContext({ withCompanyWorkSchedule: true });
    const template = buildOperationImportTemplate("recurring_multi_shift");
    const headers = parseTemplateHeaders(template.body);
    const weekdayValues = {
      lunes: "1",
      martes: "1",
      miercoles: "1",
      jueves: "1",
      viernes: "1",
      sabado: "0",
      domingo: "0",
    };
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        vigencia_desde: FUTURE_DATE,
        horario_inicio: "06:00",
        horario_fin: "14:00",
        modo_horario: "MULTI_SHIFT",
        turno_codigo: "MANANA",
        turno_nombre: "Mañana",
        ...weekdayValues,
      }),
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        vigencia_desde: FUTURE_DATE,
        horario_inicio: "14:00",
        horario_fin: "22:00",
        modo_horario: "MULTI_SHIFT",
        turno_codigo: "TARDE",
        turno_nombre: "Tarde",
        ...weekdayValues,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.format, "recurring");
    assert.equal(preview.summary.validRows, 2);
    assert.equal(preview.summary.canConfirm, true);
    assert.equal(preview.rows[0]?.scheduleMode, "MULTI_SHIFT");
    assert.equal(preview.rows[0]?.scheduleSource, "COMPANY");
    assert.equal(
      preview.rows[0]?.multiShiftGroupKey,
      `${sampleService.id}|2026-12-01|MULTI_SHIFT`,
    );
  });

  it("downloaded operations templates do not include sample data rows", () => {
    assert.deepEqual(templateDataLines(buildOperationImportTemplate().body), []);
    for (const variant of OPERATION_IMPORT_TEMPLATE_VARIANTS) {
      const template = buildOperationImportTemplate(variant);
      assert.deepEqual(templateDataLines(template.body), []);
    }
  });

  it("canonical template PUNTUAL row reaches valid preview as ONE_TIME", async () => {
    mockImportContext();
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "PUNTUAL",
        Fecha: FUTURE_DATE,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.format, "canonical");
    assert.equal(preview.rows[0]?.operationKind, "ONE_TIME");
    assert.equal(preview.rows[0]?.status, "valid");
  });

  it("canonical template FIJA row accepts SI/NO weekday flags", async () => {
    mockImportContext();
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "FIJA",
        "Vigencia desde": FUTURE_DATE,
        "Horario inicio": "09:00",
        "Horario fin": "18:00",
        Lunes: "SI",
        Martes: "SI",
        Miercoles: "NO",
        Jueves: "1",
        Viernes: "0",
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.rows[0]?.scheduleMode, "SINGLE");
    assert.equal(preview.rows[0]?.status, "valid");
  });

  it("canonical template rejects invalid weekday values", async () => {
    mockImportContext();
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "FIJA",
        "Vigencia desde": FUTURE_DATE,
        "Horario inicio": "09:00",
        "Horario fin": "18:00",
        Lunes: "quizás",
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.rows[0]?.status, "invalid");
    assert.ok(preview.rows[0]?.errors.some((message) => message.includes("Valor de día inválido")));
  });

  it("canonical template MULTI_TURNO groups two shift rows", async () => {
    mockImportContext({ withCompanyWorkSchedule: true });
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const weekdayRow = {
      Lunes: "SI",
      Martes: "SI",
      Miercoles: "SI",
      Jueves: "SI",
      Viernes: "SI",
      Sabado: "NO",
      Domingo: "NO",
    };
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "MULTI_TURNO",
        "Vigencia desde": FUTURE_DATE,
        "Horario inicio": "06:00",
        "Horario fin": "14:00",
        "Turno codigo": "MANANA",
        ...weekdayRow,
      }),
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "MULTI_TURNO",
        "Vigencia desde": FUTURE_DATE,
        "Horario inicio": "14:00",
        "Horario fin": "22:00",
        "Turno codigo": "TARDE",
        ...weekdayRow,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.summary.validRows, 2);
    assert.equal(preview.summary.canConfirm, true);
    assert.equal(preview.rows[0]?.scheduleMode, "MULTI_SHIFT");
  });

  it("canonical template FIJA with empty schedule uses company weekly schedule", async () => {
    mockImportContext({ withCompanyWorkSchedule: true });
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "FIJA",
        "Vigencia desde": FUTURE_DATE,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.rows[0]?.scheduleSource, "COMPANY");
    assert.equal(preview.rows[0]?.status, "valid");
  });

  it("canonical template FIJA without company schedule fails when schedule columns are empty", async () => {
    mockImportContext();
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "FIJA",
        "Vigencia desde": FUTURE_DATE,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.rows[0]?.status, "invalid");
    assert.ok(
      preview.rows[0]?.errors.some((message) =>
        message.includes("horario laboral semanal configurado"),
      ),
    );
  });

  it("canonical template supports mixed PUNTUAL, FIJA and MULTI_TURNO rows", async () => {
    mockImportContext({ withCompanyWorkSchedule: true });
    const template = buildOperationImportTemplate();
    const headers = parseTemplateHeaders(template.body);
    const weekdayRow = {
      Lunes: "SI",
      Martes: "1",
      Miercoles: "NO",
      Jueves: "0",
      Viernes: "SI",
      Sabado: "NO",
      Domingo: "NO",
    };
    const buffer = buildCsvFromTemplate(template.body, [
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "PUNTUAL",
        Fecha: FUTURE_DATE,
      }),
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "FIJA",
        "Vigencia desde": "10/12/2026",
      }),
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "MULTI_TURNO",
        "Vigencia desde": "20/12/2026",
        "Horario inicio": "06:00",
        "Horario fin": "14:00",
        "Turno codigo": "MANANA",
        ...weekdayRow,
      }),
      buildRowFromTemplate(headers, {
        Sucursal: "213",
        Tipo: "MULTI_TURNO",
        "Vigencia desde": "20/12/2026",
        "Horario inicio": "14:00",
        "Horario fin": "22:00",
        "Turno codigo": "TARDE",
        ...weekdayRow,
      }),
    ]);
    const preview = await operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(preview.format, "canonical");
    assert.equal(preview.summary.totalRows, 4);
    assert.equal(preview.summary.validRows, 4);
    assert.equal(preview.summary.canConfirm, true);
    assert.equal(preview.rows[0]?.operationKind, "ONE_TIME");
    assert.equal(preview.rows[1]?.operationKind, "RECURRING");
    assert.equal(preview.rows[1]?.scheduleSource, "COMPANY");
    assert.equal(preview.rows[2]?.scheduleMode, "MULTI_SHIFT");
    assert.equal(preview.rows[3]?.scheduleMode, "MULTI_SHIFT");

    const prepared = await operationsImportStrategy.prepare(COMPANY_ID, buffer, CSV_FILE_NAME);
    assert.equal(prepared.summary.createdEstimate, 3);
  });
});
