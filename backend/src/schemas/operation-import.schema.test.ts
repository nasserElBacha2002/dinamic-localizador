import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collapseRecurringMultiShiftConfirmRows,
  orderRecurringMultiShiftImportSeeds,
} from "../utils/operations/operation-import-multi-shift";
import { operationImportConfirmSchema } from "./operation-import.schema";

describe("operation-import.schema MULTI_SHIFT confirm contract", () => {
  it("accepts MULTI_SHIFT rows with shift only (not shifts[])", () => {
    const parsed = operationImportConfirmSchema.safeParse({
      rows: [
        {
          operationKind: "RECURRING",
          scheduleMode: "MULTI_SHIFT",
          serviceId: "00000000-0000-4000-8000-000000000001",
          validFrom: "2026-12-01",
          validUntil: null,
          scheduleSource: "COMPANY",
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          shift: {
            code: "MANANA",
            name: "Mañana",
            startTime: "06:00",
            endTime: "14:00",
            days: [{ dayOfWeek: 1, isEnabled: true }],
          },
        },
      ],
    });

    assert.equal(parsed.success, true);
  });

  it("rejects MULTI_SHIFT rows that send shifts[] on the public confirm API", () => {
    const parsed = operationImportConfirmSchema.safeParse({
      rows: [
        {
          operationKind: "RECURRING",
          scheduleMode: "MULTI_SHIFT",
          serviceId: "00000000-0000-4000-8000-000000000001",
          validFrom: "2026-12-01",
          validUntil: null,
          scheduleSource: "COMPANY",
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 15,
          shifts: [
            {
              code: "MANANA",
              name: "Mañana",
              sortOrder: 0,
              startTime: "06:00",
              endTime: "14:00",
              days: [{ dayOfWeek: 1, isEnabled: true }],
            },
          ],
        },
      ],
    });

    assert.equal(parsed.success, false);
  });
});

describe("operation-import-multi-shift ordering with server template catalog", () => {
  it("uses templateSortOrderById rather than client-provided ordering hints", () => {
    const templateA = "00000000-0000-4000-8000-0000000000aa";
    const templateB = "00000000-0000-4000-8000-0000000000bb";
    const sortOrderById = new Map<string, number>([
      [templateA, 10],
      [templateB, 1],
    ]);

    const ordered = orderRecurringMultiShiftImportSeeds(
      [
        {
          code: "Z",
          name: "Z",
          templateId: templateA,
          sortOrder: 999,
          startTime: "08:00",
          endTime: "12:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
        {
          code: "A",
          name: "A",
          templateId: templateB,
          sortOrder: 999,
          startTime: "06:00",
          endTime: "10:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      ],
      sortOrderById,
    );

    assert.equal(ordered[0]?.templateId, templateB);
    assert.equal(ordered[1]?.templateId, templateA);
    assert.equal(ordered[0]?.sortOrder, 0);
    assert.equal(ordered[1]?.sortOrder, 1);
  });

  it("collapse output is order-independent until server-side ordering is applied", () => {
    const buildRows = () => [
      {
        operationKind: "RECURRING" as const,
        scheduleMode: "MULTI_SHIFT" as const,
        serviceId: "00000000-0000-4000-8000-000000000001",
        validFrom: "2026-12-01",
        validUntil: null,
        scheduleSource: "COMPANY" as const,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        shift: {
          code: "TARDE",
          name: "Tarde",
          startTime: "14:00",
          endTime: "22:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      },
      {
        operationKind: "RECURRING" as const,
        scheduleMode: "MULTI_SHIFT" as const,
        serviceId: "00000000-0000-4000-8000-000000000001",
        validFrom: "2026-12-01",
        validUntil: null,
        scheduleSource: "COMPANY" as const,
        earlyToleranceMinutes: 15,
        lateToleranceMinutes: 15,
        shift: {
          code: "MANANA",
          name: "Mañana",
          startTime: "06:00",
          endTime: "14:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      },
    ];

    const sortOrderById = new Map<string, number>();
    const normalize = (rows: ReturnType<typeof buildRows>) => {
      const collapsed = collapseRecurringMultiShiftConfirmRows(rows);
      const multi = collapsed.find((row) => row.scheduleMode === "MULTI_SHIFT");
      assert.ok(multi && "shifts" in multi);
      return orderRecurringMultiShiftImportSeeds(multi.shifts, sortOrderById);
    };

    assert.deepEqual(normalize(buildRows()), normalize([...buildRows()].reverse()));
  });
});
