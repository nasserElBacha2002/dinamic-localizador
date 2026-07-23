import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";

setRuntimeCompanyId("co-1");

mockApiModule("api/services.api", {
  getServices: async () => ({
    data: [
      {
        id: "svc-1",
        name: "Sucursal Palermo",
        address: "Av. Santa Fe 1000",
        neighborhood: "Palermo",
        locality: "CABA",
        serviceFormat: "SUPER",
        latitude: -34.58,
        longitude: -58.42,
        allowedRadiusMeters: 150,
        active: true,
        googlePlaceId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    meta: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
  }),
  getServiceFacets: async () => ({
    localities: ["CABA"],
    neighborhoodsByLocality: { CABA: ["Palermo"] },
  }),
  getServiceById: async () => {
    throw new Error("not used");
  },
  createService: async () => {
    throw new Error("not used");
  },
  updateService: async () => {
    throw new Error("not used");
  },
  deactivateService: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/company-location-types.api", {
  listCompanyLocationTypes: async () => [
    {
      id: "lt-1",
      companyId: "co-1",
      code: "SUPER",
      name: "Súper",
      isActive: true,
      sortOrder: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  createCompanyLocationType: async () => {
    throw new Error("not used");
  },
  updateCompanyLocationType: async () => {
    throw new Error("not used");
  },
  disableCompanyLocationType: async () => {
    throw new Error("not used");
  },
});

mockApiModule("api/company-users.api", {
  getCompanyMembership: async () => ({
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isPlatformAdmin: false,
    permissions: ["services:manage", "services:read"],
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
import { LocationMapCanvas } from "../../components/services/location-picker/components/LocationMapSection";
import { mockViewport } from "../../test/mock-match-media";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { renderPage } from "../../test/render-page";

installLayoutPolyfills();

let ServicesListPage: React.ComponentType;

before(async () => {
  ({ ServicesListPage } = await import("./ServicesListPage"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("ServicesListPage responsive (real page)", () => {
  it("shows desktop table", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <Routes>
        <Route path="/services" element={<ServicesListPage />} />
      </Routes>,
      { route: "/services" },
    );

    await waitFor(() => assert.ok(view.getByText("Sucursal Palermo")));
    assert.ok(view.getByRole("table"));
  });

  it("shows mobile cards and filter drawer without rigid 360px min-width", async () => {
    mockViewport("mobile");
    const view = renderPage(
      <Routes>
        <Route path="/services" element={<ServicesListPage />} />
      </Routes>,
      { route: "/services" },
    );

    await waitFor(() => assert.ok(view.getByText("Sucursal Palermo")));
    assert.equal(view.queryByRole("table"), null);
    assert.equal(view.container.innerHTML.includes("min-width: 360"), false);

    fireEvent.click(view.getByRole("button", { name: /^Filtros/ }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("combobox", { name: "Estado" }));
    });
  });

  it("shows map fallback when maps are unavailable", () => {
    const mapRef = { current: null };
    const view = renderPage(
      <LocationMapCanvas
        mapContainerRef={mapRef}
        mapsLoadState="error"
        locationState="ERROR"
      />,
    );
    assert.ok(view.getByText(/Mapa no disponible/i));
  });
});
