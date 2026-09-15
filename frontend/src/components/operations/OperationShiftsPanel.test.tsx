/**
 * OperationShiftsPanel: versions + exceptions UI with mocked shift hooks.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";
import type { OperationShiftWithVersions } from "../../types/operation-shift";

const morningShift: OperationShiftWithVersions = {
  id: "shift-morning",
  companyId: "co-1",
  operationId: "op-1",
  templateId: null,
  code: "MANANA",
  name: "Mañana",
  sortOrder: 0,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  versions: [
    {
      id: "ver-1",
      companyId: "co-1",
      operationShiftId: "shift-morning",
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
      startTime: "08:00",
      endTime: "16:00",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      days: [
        { dayOfWeek: 1, isEnabled: true },
        { dayOfWeek: 2, isEnabled: true },
        { dayOfWeek: 3, isEnabled: true },
        { dayOfWeek: 4, isEnabled: true },
        { dayOfWeek: 5, isEnabled: true },
      ],
    },
    {
      id: "ver-future",
      companyId: "co-1",
      operationShiftId: "shift-morning",
      effectiveFrom: "2099-01-01",
      effectiveUntil: null,
      startTime: "09:00",
      endTime: "17:00",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      days: [],
    },
  ],
};

mock.module("../../hooks/useOperationShifts", {
  namedExports: {
    useOperationShifts: () => ({
      data: [morningShift],
      isPending: false,
      isError: false,
      error: null,
      refetch: async () => undefined,
    }),
    useCreateOperationShift: () => ({ isPending: false, mutateAsync: async () => morningShift }),
    useDeactivateOperationShift: () => ({
      isPending: false,
      mutateAsync: async () => morningShift,
    }),
    useAddOperationShiftVersion: () => ({
      isPending: false,
      mutateAsync: async () => morningShift.versions[0],
    }),
    useUpsertOperationShiftException: () => ({
      isPending: false,
      mutateAsync: async () => ({ exception: {}, workday: null }),
    }),
    useTransitionOperationToMultiShift: () => ({
      isPending: false,
      mutateAsync: async () => ({}),
    }),
    useTransitionOperationToSingle: () => ({
      isPending: false,
      mutateAsync: async () => ({}),
    }),
  },
});

mock.module("../../hooks/useShiftTemplates", {
  namedExports: {
    useShiftTemplates: () => ({
      data: [],
      isPending: false,
      isError: false,
      error: null,
    }),
  },
});

import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

installLayoutPolyfills();

let renderPage: typeof import("../../test/render-page").renderPage;
let OperationShiftsPanel: typeof import("./OperationShiftsPanel").OperationShiftsPanel;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ OperationShiftsPanel } = await import("./OperationShiftsPanel"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("OperationShiftsPanel", () => {
  it("shows current and upcoming versions for MULTI_SHIFT", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <OperationShiftsPanel
        operationId="op-1"
        scheduleMode="MULTI_SHIFT"
        canManage
        onFeedback={() => undefined}
      />,
    );

    await waitFor(() => {
      assert.ok(view.getByText("Mañana"));
    });
    assert.ok(view.getByText(/Vigente:/i));
    assert.ok(view.getByText(/Próximas:/i));
    assert.ok(view.getByRole("button", { name: /Nueva versión/i }));
    assert.ok(view.getByRole("button", { name: /Excepción/i }));
  });
});
