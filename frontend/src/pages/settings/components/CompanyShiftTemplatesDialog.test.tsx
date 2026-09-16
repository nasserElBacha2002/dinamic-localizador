/**
 * CompanyShiftTemplatesDialog smoke: loads with mocked shift-templates query.
 * mock.module must run before the component module graph loads real hooks.
 */
import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";
import type { CompanyShiftTemplate } from "../../../types/operation-shift";

const templates: CompanyShiftTemplate[] = [
  {
    id: "tpl-1",
    companyId: "c1",
    code: "MANANA",
    name: "Turno mañana",
    startTime: "08:00",
    endTime: "16:00",
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "tpl-2",
    companyId: "c1",
    code: "NOCHE",
    name: "Turno noche",
    startTime: "22:00",
    endTime: "06:00",
    sortOrder: 1,
    isActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

mock.module("../../../hooks/useShiftTemplates", {
  namedExports: {
    useShiftTemplates: () => ({
      data: templates,
      isPending: false,
      isError: false,
      error: null,
      refetch: async () => undefined,
    }),
    useCreateShiftTemplate: () => ({
      isPending: false,
      mutateAsync: async () => templates[0],
    }),
    useUpdateShiftTemplate: () => ({
      isPending: false,
      mutateAsync: async () => templates[0],
    }),
    useDeactivateShiftTemplate: () => ({
      isPending: false,
      mutateAsync: async () => templates[0],
    }),
  },
});

import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../../test/layout-polyfills";
import { mockViewport } from "../../../test/mock-match-media";

installLayoutPolyfills();

let renderPage: typeof import("../../../test/render-page").renderPage;
let CompanyShiftTemplatesDialog: typeof import("./CompanyShiftTemplatesDialog").CompanyShiftTemplatesDialog;

before(async () => {
  ({ renderPage } = await import("../../../test/render-page"));
  ({ CompanyShiftTemplatesDialog } = await import("./CompanyShiftTemplatesDialog"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("CompanyShiftTemplatesDialog", () => {
  it("renders templates and Reactivar for inactive rows", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <CompanyShiftTemplatesDialog opened onClose={() => undefined} canUpdate />,
    );

    await waitFor(() => {
      assert.ok(view.getByRole("heading", { name: /Plantillas de turnos/i }));
    });
    assert.ok(view.getByText("Turno mañana"));
    assert.ok(view.getByText("Turno noche"));
    assert.ok(view.getByRole("button", { name: /^Reactivar$/i }));
    assert.ok(view.getByRole("button", { name: /^Editar$/i }));
  });
});
