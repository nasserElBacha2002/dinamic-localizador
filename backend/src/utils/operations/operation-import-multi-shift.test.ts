import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRecurringMultiShiftConfirmGroupsConsistent,
  collapseRecurringMultiShiftConfirmRows,
  IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
  orderRecurringMultiShiftImportSeeds,
} from "./operation-import-multi-shift";

const baseShiftRow = (overrides: Record<string, unknown> = {}) => ({
  operationKind: "RECURRING" as const,
  scheduleMode: "MULTI_SHIFT" as const,
  serviceId: "service-1",
  validFrom: "2026-12-01",
  validUntil: null,
  scheduleSource: "COMPANY" as const,
  earlyToleranceMinutes: 15,
  lateToleranceMinutes: 15,
  earlyToleranceSource: "COMPANY_DEFAULT" as const,
  lateToleranceSource: "COMPANY_DEFAULT" as const,
  shift: {
    code: "MANANA",
    name: "Mañana",
    sortOrder: 99,
    startTime: "06:00",
    endTime: "14:00",
    days: [{ dayOfWeek: 1, isEnabled: true }],
  },
  ...overrides,
});

describe("operation-import-multi-shift group invariants", () => {
  it("rejects confirm rows with different validUntil in the same group", () => {
    assert.throws(
      () =>
        assertRecurringMultiShiftConfirmGroupsConsistent([
          baseShiftRow(),
          baseShiftRow({ validUntil: "2026-12-31" }),
        ]),
      (error: unknown) =>
        error instanceof Error && error.message === IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
    );
  });

  it("rejects confirm rows with different tolerances in the same group", () => {
    assert.throws(
      () =>
        assertRecurringMultiShiftConfirmGroupsConsistent([
          baseShiftRow(),
          baseShiftRow({ earlyToleranceMinutes: 30 }),
        ]),
      (error: unknown) =>
        error instanceof Error && error.message === IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
    );
  });

  it("rejects confirm rows with different provenance in the same group", () => {
    assert.throws(
      () =>
        assertRecurringMultiShiftConfirmGroupsConsistent([
          baseShiftRow(),
          baseShiftRow({ earlyToleranceSource: "CUSTOM" }),
        ]),
      (error: unknown) =>
        error instanceof Error && error.message === IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
    );
  });
});

describe("operation-import-multi-shift ordering", () => {
  const orderCollapsedByCode = (rows: ReturnType<typeof baseShiftRow>[]) => {
    const collapsed = collapseRecurringMultiShiftConfirmRows(rows);
    const multi = collapsed[0];
    assert.ok(multi && multi.scheduleMode === "MULTI_SHIFT" && "shifts" in multi);
    return orderRecurringMultiShiftImportSeeds(multi.shifts, new Map());
  };

  it("orders shifts by template catalog sortOrder then code, independent of row order", () => {
    const templateManana = "00000000-0000-4000-8000-0000000000aa";
    const templateTarde = "00000000-0000-4000-8000-0000000000bb";
    const sortOrderById = new Map<string, number>([
      [templateManana, 5],
      [templateTarde, 50],
    ]);

    const orderFromRows = (rows: ReturnType<typeof baseShiftRow>[]) => {
      const collapsed = collapseRecurringMultiShiftConfirmRows(rows);
      const multi = collapsed[0];
      assert.ok(multi && multi.scheduleMode === "MULTI_SHIFT" && "shifts" in multi);
      return orderRecurringMultiShiftImportSeeds(multi.shifts, sortOrderById);
    };

    const orderedA = orderFromRows([
      baseShiftRow({
        shift: {
          code: "TARDE",
          name: "Tarde",
          templateId: templateTarde,
          sortOrder: 99,
          startTime: "14:00",
          endTime: "22:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      }),
      baseShiftRow({
        shift: {
          code: "MANANA",
          name: "Mañana",
          templateId: templateManana,
          sortOrder: 99,
          startTime: "06:00",
          endTime: "14:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      }),
    ]);

    const orderedB = orderFromRows([
      baseShiftRow({
        shift: {
          code: "MANANA",
          name: "Mañana",
          templateId: templateManana,
          sortOrder: 99,
          startTime: "06:00",
          endTime: "14:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      }),
      baseShiftRow({
        shift: {
          code: "TARDE",
          name: "Tarde",
          templateId: templateTarde,
          sortOrder: 99,
          startTime: "14:00",
          endTime: "22:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      }),
    ]);

    assert.deepEqual(orderedA, orderedB);
    assert.equal(orderedA[0]?.code, "MANANA");
    assert.equal(orderedA[0]?.sortOrder, 0);
    assert.equal(orderedA[1]?.code, "TARDE");
    assert.equal(orderedA[1]?.sortOrder, 1);
  });

  it("falls back to normalized code when no template sortOrder is available", () => {
    const ordered = orderCollapsedByCode([
      baseShiftRow({
        shift: {
          code: "TARDE",
          name: "Tarde",
          sortOrder: 50,
          startTime: "14:00",
          endTime: "22:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      }),
      baseShiftRow({
        shift: {
          code: "MANANA",
          name: "Mañana",
          sortOrder: 5,
          startTime: "06:00",
          endTime: "14:00",
          days: [{ dayOfWeek: 1, isEnabled: true }],
        },
      }),
    ]);

    assert.equal(ordered[0]?.code, "MANANA");
    assert.equal(ordered[0]?.sortOrder, 0);
    assert.equal(ordered[1]?.code, "TARDE");
    assert.equal(ordered[1]?.sortOrder, 1);
  });
});
