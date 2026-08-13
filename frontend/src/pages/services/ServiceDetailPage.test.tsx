/**
 * Detail page: same structure for viewer and manager; map is view-only.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock } from "node:test";
import React from "react";
import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

let membershipPermissions = ["services:read"];

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "VIEWER",
    isPlatformAdmin: false,
    permissions: membershipPermissions,
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

let mapViewMounted = false;

mock.module(
  pathToFileURL(
    path.join(srcRoot, "components/services/location-picker/components/ServiceLocationMapView.tsx"),
  ).href,
  {
    namedExports: {
      ServiceLocationMapView: () => {
        mapViewMounted = true;
        return React.createElement(
          "div",
          { "data-testid": "service-location-map-view" },
          "MAP_VIEW",
        );
      },
    },
  },
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { Route, Routes } from "react-router";
import { LegacyServiceRedirect } from "../../routes/legacy-redirects";

let renderPage: typeof import("../../test/render-page").renderPage;
let ServiceDetailPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ ServiceDetailPage } = await import("./ServiceDetailPage"));
});

beforeEach(() => {
  membershipPermissions = ["services:read"];
  mapViewMounted = false;
});

afterEach(() => {
  cleanup();
});

describe("ServiceDetailPage", () => {
  it("viewer sees detail cards and view map without Editar or inputs", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/services/:id" element={<ServiceDetailPage />} />
      </Routes>,
      { route: "/services/svc-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText("Sucursal Centro").length >= 1);
    });
    assert.ok(view.getByText("Información general"));
    assert.ok(view.getByTestId("service-location-map-view"));
    assert.equal(mapViewMounted, true);
    assert.equal(view.queryByRole("button", { name: /^Editar$/i }), null);
    assert.equal(view.queryByRole("textbox"), null);
    assert.equal(view.queryByRole("combobox"), null);
    assert.equal(view.queryByLabelText(/Buscar dirección/i), null);
    assert.equal(view.queryByText(/Mapa interactivo/i), null);
  });

  it("manager sees the same detail structure with Editar", async () => {
    membershipPermissions = ["services:manage", "services:read"];
    const view = renderPage(
      <Routes>
        <Route path="/services/:id" element={<ServiceDetailPage />} />
      </Routes>,
      { route: "/services/svc-1" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("link", { name: /^Editar$/i }));
    });
    assert.ok(view.getByText("Información general"));
    assert.ok(view.getByTestId("service-location-map-view"));
    assert.equal(view.queryByRole("textbox"), null);
    assert.equal(view.queryByRole("button", { name: /Guardar cambios/i }), null);
    assert.equal(view.queryByRole("link", { name: /^Crear operación$/i }), null);
  });

  it("operations manager can open create operation with serviceId preset", async () => {
    membershipPermissions = ["operations:manage", "services:read"];
    const view = renderPage(
      <Routes>
        <Route path="/services/:id" element={<ServiceDetailPage />} />
      </Routes>,
      { route: "/services/svc-1" },
    );

    await waitFor(() => {
      assert.ok(view.getByRole("link", { name: /^Crear operación$/i }));
    });
    const createLink = view.getByRole("link", { name: /^Crear operación$/i });
    assert.equal(createLink.getAttribute("href"), "/operations/new?serviceId=svc-1");
  });

  it("legacy /stores/:id lands on service detail", async () => {
    const view = renderPage(
      <Routes>
        <Route path="/stores/:id" element={<LegacyServiceRedirect />} />
        <Route path="/services/:id" element={<ServiceDetailPage />} />
        <Route path="/services/:id/edit" element={<div>SHOULD_NOT_EDIT</div>} />
      </Routes>,
      { route: "/stores/svc-1" },
    );

    await waitFor(() => {
      assert.ok(view.getAllByText("Sucursal Centro").length >= 1);
    });
    assert.equal(view.queryByText("SHOULD_NOT_EDIT"), null);
  });
});
