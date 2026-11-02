import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { operationImportConfirmSchema } from "../../schemas/operation-import.schema";
import { companyOperationalDefaultsResolver } from "../companies/company-operational-defaults.resolver";
import { companyShiftTemplateRepository } from "../../repositories/companies/company-shift-template.repository";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { serviceRepository } from "../../repositories/locations/service.repository";
import { operationImportService } from "./operation-import.service";
import { operationService } from "./operation.service";

const COMPANY_ID = "company-1";
const SERVICE_ID = "00000000-0000-4000-8000-000000000213";
const TEMPLATE_MANANA = "00000000-0000-4000-8000-0000000000aa";
const TEMPLATE_TARDE = "00000000-0000-4000-8000-0000000000bb";

describe("operationImportService confirm schema alignment", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("processes every schema-valid MULTI_SHIFT confirm row without shift/shifts mismatch", async () => {
    const payload = {
      rows: [
        {
          operationKind: "RECURRING" as const,
          scheduleMode: "MULTI_SHIFT" as const,
          serviceId: SERVICE_ID,
          validFrom: "2026-12-01",
          validUntil: null,
          scheduleSource: "COMPANY" as const,
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          shift: {
            code: "MANANA",
            name: "Mañana",
            templateId: TEMPLATE_MANANA,
            startTime: "06:00",
            endTime: "14:00",
            days: [{ dayOfWeek: 1, isEnabled: true }],
          },
        },
        {
          operationKind: "RECURRING" as const,
          scheduleMode: "MULTI_SHIFT" as const,
          serviceId: SERVICE_ID,
          validFrom: "2026-12-01",
          validUntil: null,
          scheduleSource: "COMPANY" as const,
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          shift: {
            code: "TARDE",
            name: "Tarde",
            templateId: TEMPLATE_TARDE,
            startTime: "14:00",
            endTime: "22:00",
            days: [{ dayOfWeek: 1, isEnabled: true }],
          },
        },
      ],
    };

    const parsed = operationImportConfirmSchema.safeParse(payload);
    assert.equal(parsed.success, true);
    if (!parsed.success) {
      return;
    }

    mock.method(serviceRepository, "listAllActive", async () => [
      {
        id: SERVICE_ID,
        name: "213",
        active: true,
      },
    ]);
    mock.method(companyOperationalDefaultsResolver, "getImportDefaults", async () => ({
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 15,
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultOperationStartTime: "09:00",
      defaultOperationEndTime: "18:00",
    }));
    mock.method(operationRepository, "findExistingActiveRecurringKeys", async () => new Set());
    mock.method(companyShiftTemplateRepository, "findById", async (_companyId, templateId) => {
      if (templateId === TEMPLATE_TARDE) {
        return {
          id: TEMPLATE_TARDE,
          companyId: COMPANY_ID,
          code: "TARDE",
          name: "Tarde",
          startTime: "14:00",
          endTime: "22:00",
          sortOrder: 1,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        };
      }
      if (templateId === TEMPLATE_MANANA) {
        return {
          id: TEMPLATE_MANANA,
          companyId: COMPANY_ID,
          code: "MANANA",
          name: "Mañana",
          startTime: "06:00",
          endTime: "14:00",
          sortOrder: 5,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        };
      }
      return null;
    });

    let capturedBatch: unknown = null;
    mock.method(operationService, "createRecurringImportBatch", async (_companyId, batch) => {
      capturedBatch = batch;
      return { operations: [], workdaySyncError: null };
    });
    mock.method(operationService, "assertRecurringCreateInput", async () => undefined);

    await operationImportService.confirm(COMPANY_ID, parsed.data.rows);

    assert.ok(capturedBatch);
    const batch = capturedBatch as Array<{ input: { shifts?: Array<{ code: string; sortOrder: number }> } }>;
    assert.equal(batch[0]?.input.shifts?.[0]?.code, "TARDE");
    assert.equal(batch[0]?.input.shifts?.[0]?.sortOrder, 0);
    assert.equal(batch[0]?.input.shifts?.[1]?.code, "MANANA");
    assert.equal(batch[0]?.input.shifts?.[1]?.sortOrder, 1);
  });
});
