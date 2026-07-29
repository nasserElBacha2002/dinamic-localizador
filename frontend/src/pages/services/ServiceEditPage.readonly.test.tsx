/**
 * Phase 1: read-only users must not see editable service form / map on /:id.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const service = {
  id: "svc-1",
  name: "Sucursal Centro",
  address: "Av. Corrientes 1234",
  neighborhood: "Centro",
  locality: "CABA",
  serviceFormat: "SUPER",
  latitude: -34.6,
  longitude: -58.4,
  allowedRadiusMeters: 150,
  googlePlaceId: "place-1",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

mockApiModule(
  "api/services.api",
  {
    getServiceById: async () => service,
  },
  [
    "getServices",
    "getServiceFacets",
    "getServiceById",
    "createService",
    "updateService",
    "deactivateService",
  ],
);

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "VIEWER",
    isPlatformAdmin: false,
    permissions: ["services:read"],
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
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { Route, Routes } from "react-router";

let renderPage: typeof import("../../test/render-page").renderPage;
let ServiceEditPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ ServiceEditPage } = await import("./ServiceEditPage"));
});

afterEach(() => {
  cleanup();
});

describe("ServiceEditPage read-only gate", () => {
  it("hides Guardar cambios for read-only users on /:id", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/services/:id" element={<ServiceEditPage />} />
      </Routes>,
      { route: "/services/svc-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText("Sucursal Centro").length >= 1);
    });
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);
    assert.ok(view.getByText(/mapa interactivo está disponible solo/i));
    assert.equal(view.queryByRole("textbox"), null);
    assert.equal(view.queryByRole("combobox"), null);
    assert.equal(view.container.querySelector("[data-testid='service-map'], .gm-style"), null);
    assert.ok(view.getByText("Información general"));
    assert.ok(view.getByText(/-34\.6, -58\.4/));
  });
});
