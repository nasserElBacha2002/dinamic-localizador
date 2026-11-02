import assert from "node:assert/strict";
import sql from "mssql";
import { afterEach, describe, it, mock } from "node:test";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../../constants/company-settings";
import { setTestPool } from "../../database/connection";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { serviceRepository } from "../../repositories/locations/service.repository";
import { companyWorkScheduleRepository } from "../../repositories/companies/company-work-schedule.repository";
import { companyShiftTemplateRepository } from "../../repositories/companies/company-shift-template.repository";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { companyOperationalDefaultsResolver } from "../../services/companies/company-operational-defaults.resolver";
import { companyLocationTypesService } from "../../services/companies/company-location-types.service";
import { operationImportService } from "../../services/operations/operation-import.service";
import { operationsImportStrategy } from "./operations.strategy";

const COMPANY_ID = "company-1";
const FUTURE_DATE = "01/12/2026";
const CSV_FILE_NAME = "import.csv";

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

describe("operationsImportStrategy confirm payload", () => {
  const restores: Array<() => void> = [];

  afterEach(() => {
    mock.restoreAll();
    setTestPool(null);
    for (const restore of restores.splice(0)) {
      restore();
    }
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

  const patchTransaction = () => {
    const OriginalTransaction = sql.Transaction;
    class FakeTransaction {
      async begin(): Promise<void> {
        return undefined;
      }

      async commit(): Promise<void> {
        return undefined;
      }

      async rollback(): Promise<void> {
        return undefined;
      }
    }

    (sql as { Transaction: typeof sql.Transaction }).Transaction =
      FakeTransaction as unknown as typeof sql.Transaction;
    restores.push(() => {
      (sql as { Transaction: typeof sql.Transaction }).Transaction = OriginalTransaction;
    });
  };

  const loadDefaultImport = async () => {
    mockServices();
    mockImportDefaults({
      earlyToleranceMinutes: 55,
      lateToleranceMinutes: 85,
    });
    const buffer = buildCsvBuffer(["PUNTO", "Fecha"], ["213", FUTURE_DATE]);
    const [preview, prepared] = await Promise.all([
      operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME),
      operationsImportStrategy.prepare(COMPANY_ID, buffer, CSV_FILE_NAME),
    ]);
    return { preview, prepared };
  };

  it("includes inherited tolerance sources in the prepared confirm payload", async () => {
    setupUnitTestEnv();
    const { preview, prepared } = await loadDefaultImport();
    const payload = prepared.rows[0]?.payload;

    assert.ok(payload);
    assert.equal(preview.rows[0]?.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(payload.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(payload.lateToleranceSource, "COMPANY_DEFAULT");
    assert.equal(payload.earlyToleranceMinutes, 55);
    assert.equal(payload.lateToleranceMinutes, 85);
  });

  it("keeps CUSTOM tolerance sources in the prepared confirm payload", async () => {
    setupUnitTestEnv();
    mockServices();
    mockImportDefaults();

    const buffer = buildCsvBuffer(
      ["PUNTO", "Fecha", "tolerancia_temprana", "tolerancia_tardia"],
      ["213", FUTURE_DATE, "12", "18"],
    );
    const [preview, prepared] = await Promise.all([
      operationImportService.previewFile(COMPANY_ID, buffer, CSV_FILE_NAME),
      operationsImportStrategy.prepare(COMPANY_ID, buffer, CSV_FILE_NAME),
    ]);
    const payload = prepared.rows[0]?.payload;

    assert.ok(payload);
    assert.equal(preview.rows[0]?.earlyToleranceSource, "CUSTOM");
    assert.equal(payload.earlyToleranceSource, "CUSTOM");
    assert.equal(payload.lateToleranceSource, "CUSTOM");
    assert.equal(payload.earlyToleranceMinutes, 12);
    assert.equal(payload.lateToleranceMinutes, 18);
  });

  it("preserves scheduling fields on the confirm payload besides provenance", async () => {
    setupUnitTestEnv();
    const { preview, prepared } = await loadDefaultImport();
    const previewRow = preview.rows[0];
    const payload = prepared.rows[0]?.payload;

    assert.ok(previewRow);
    assert.ok(payload);
    assert.deepEqual(
      {
        serviceId: payload.serviceId,
        scheduledStart: payload.scheduledStart,
        scheduledEnd: payload.scheduledEnd,
        earlyToleranceMinutes: payload.earlyToleranceMinutes,
        lateToleranceMinutes: payload.lateToleranceMinutes,
      },
      {
        serviceId: previewRow.serviceId,
        scheduledStart: previewRow.scheduledStart,
        scheduledEnd: previewRow.scheduledEnd,
        earlyToleranceMinutes: previewRow.earlyToleranceMinutes,
        lateToleranceMinutes: previewRow.lateToleranceMinutes,
      },
    );
  });

  it("passes prepared tolerance sources through generic import persist", async () => {
    setupUnitTestEnv();
    setTestPool({ connected: true } as sql.ConnectionPool);
    patchTransaction();

    const { prepared } = await loadDefaultImport();
    let persistedInputs: Array<{
      earlyToleranceSource: string;
      lateToleranceSource: string;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
    }> = [];

    mock.method(operationRepository, "createManyInTransaction", async (_companyId, _tx, inputs) => {
      persistedInputs = inputs;
      return inputs.map((input, index) => ({
        id: `operation-${index}`,
        serviceId: input.serviceId,
        operationKind: input.operationKind,
        scheduleMode: "SINGLE" as const,
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        earlyToleranceMinutes: input.earlyToleranceMinutes,
        lateToleranceMinutes: input.lateToleranceMinutes,
        earlyToleranceSource: input.earlyToleranceSource,
        lateToleranceSource: input.lateToleranceSource,
        status: "SCHEDULED" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    });

    await operationsImportStrategy.persist(COMPANY_ID, prepared);

    assert.equal(persistedInputs[0]?.earlyToleranceSource, "COMPANY_DEFAULT");
    assert.equal(persistedInputs[0]?.lateToleranceSource, "COMPANY_DEFAULT");
    assert.equal(persistedInputs[0]?.earlyToleranceMinutes, 55);
    assert.equal(persistedInputs[0]?.lateToleranceMinutes, 85);
  });
});
