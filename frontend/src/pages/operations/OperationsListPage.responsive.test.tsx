import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, OPERATIONS_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

mockApiModule(
  "api/operations.api",
  {
    getOperations: async () => ({
      data: [
        {
          id: "op-1",
          status: "SCHEDULED",
          operationKind: "ONE_TIME",
          scheduledStart: "2026-07-25T12:00:00.000Z",
          scheduledEnd: "2026-07-25T18:00:00.000Z",
          earlyToleranceMinutes: 15,
          lateToleranceMinutes: 10,
          scheduleSummary: null,
          service: {
            id: "svc-1",
            name: "Sucursal Centro",
            address: "Av. Corrientes 1234",
            active: true,
          },
        },
      ],
      meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    }),
  },
  OPERATIONS_API_EXPORTS,
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["operations:manage", "operations:read"],
  }),
  getCompanyUsers: async () => ({ data: [], meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }),
  getCompanyUserById: async () => {
    throw new Error("not used");
  },
  createCompanyUser: async () => {
    throw new Error("not used");
  },
  updateCompanyUser: async () => {
    throw new Error("not used");
  },
  deactivateCompanyUser: async () => {
    throw new Error("not used");
  },
  getActiveCompanyMembershipPath: () => null,
});

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router-dom";

let renderPage: typeof import("../../test/render-page").renderPage;
let OperationsListPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ OperationsListPage } = await import("./OperationsListPage"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("OperationsListPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/operations" element={<OperationsListPage />} />
      </Routes>,
      { route: "/operations" },
    );

    await waitFor(() => assert.ok(view.getByText("Sucursal Centro")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards, filters drawer, actions and navigates to detail", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/operations" element={<OperationsListPage />} />
        <Route path="/operations/:id" element={<div>Detalle operación</div>} />
      </Routes>,
      { route: "/operations" },
    );

    await waitFor(() => assert.ok(view.getByText("Sucursal Centro")));
    assert.equal(view.queryByRole("table"), null);

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Estado" }));
    });
    fireEvent.click(within(document.body).getByRole("button", { name: "Listo" }));

    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: "Más acciones de operaciones" }));
    });
    fireEvent.click(view.getByRole("button", { name: "Más acciones de operaciones" }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("menuitem", { name: /Importar/i }));
    });

    fireEvent.click(view.getByRole("button", { name: "Ver detalle" }));
    await waitFor(() => {
      assert.ok(view.getByText("Detalle operación"));
    });
  });
});
