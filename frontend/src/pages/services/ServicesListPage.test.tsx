import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import { ServicesListFiltersErrorBanner } from "./ServicesListFiltersErrorBanner";
import {
  buildServicesListApiFilters,
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
  shouldOmitServiceTableValue,
} from "./services-list-table-state";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  setupDomEnvironment();
});

function ServicesUrlHarness() {
  const location = useLocation();
  const table = useTableUrlState({
    defaults: SERVICE_TABLE_DEFAULTS,
    fields: SERVICE_TABLE_FIELDS,
    shouldOmitFromUrl: (key, value, defaults) =>
      shouldOmitServiceTableValue(key, value, defaults),
  });
  const apiFilters = buildServicesListApiFilters(table.state);

  return (
    <div>
      <span data-testid="url">{`${location.pathname}${location.search}`}</span>
      <span data-testid="api">{JSON.stringify(apiFilters)}</span>
      <button
        type="button"
        onClick={() => table.setState({ locality: "GBA", neighborhood: "" })}
      >
        Cambiar localidad
      </button>
      <button type="button" onClick={() => table.toggleSorting("locality", "asc")}>
        Ordenar localidad
      </button>
    </div>
  );
}

describe("ServicesListPage filter wiring", () => {
  it("builds the services query from URL filters and sort directions", async () => {
    const view = render(
      <MemoryRouter
        initialEntries={[
          "/services?serviceFormat=OLD&locality=CABA&neighborhood=Palermo&sortBy=name&sortOrder=desc&active=false",
        ]}
      >
        <Routes>
          <Route path="/services" element={<ServicesUrlHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const api = JSON.parse(view.getByTestId("api").textContent ?? "{}") as Record<
        string,
        unknown
      >;
      assert.equal(api.serviceFormat, "OLD");
      assert.equal(api.locality, "CABA");
      assert.equal(api.neighborhood, "Palermo");
      assert.equal(api.active, false);
      assert.equal(api.sortBy, "name");
      assert.equal(api.sortDirection, "desc");
    });
  });

  it("updates locality → barrio atomically and preserves other filters", async () => {
    const view = render(
      <MemoryRouter
        initialEntries={[
          "/services?search=central&serviceFormat=SUPER&locality=CABA&neighborhood=Palermo",
        ]}
      >
        <Routes>
          <Route path="/services" element={<ServicesUrlHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: "Cambiar localidad" }));

    await waitFor(() => {
      const url = view.getByTestId("url").textContent ?? "";
      assert.match(url, /locality=GBA/);
      assert.doesNotMatch(url, /neighborhood=/);
      assert.match(url, /search=central/);
      assert.match(url, /serviceFormat=SUPER/);
    });
  });

  it("toggles sorting ascending then descending", async () => {
    const view = render(
      <MemoryRouter initialEntries={["/services"]}>
        <Routes>
          <Route path="/services" element={<ServicesUrlHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: "Ordenar localidad" }));
    await waitFor(() => {
      const api = JSON.parse(view.getByTestId("api").textContent ?? "{}") as Record<
        string,
        unknown
      >;
      assert.equal(api.sortBy, "locality");
      assert.equal(api.sortDirection, "asc");
    });

    fireEvent.click(view.getByRole("button", { name: "Ordenar localidad" }));
    await waitFor(() => {
      const api = JSON.parse(view.getByTestId("api").textContent ?? "{}") as Record<
        string,
        unknown
      >;
      assert.equal(api.sortBy, "locality");
      assert.equal(api.sortDirection, "desc");
    });
  });

  it("shows facets/format errors with retry without implying empty success", () => {
    const retries: string[] = [];
    const view = render(
      <MantineProvider>
        <ServicesListFiltersErrorBanner
          facetsFailed
          formatsFailed
          onRetryFacets={() => retries.push("facets")}
          onRetryFormats={() => retries.push("formats")}
        />
        <div>Listado visible</div>
      </MantineProvider>,
    );

    assert.ok(view.getByText(/No se pudieron cargar algunos filtros/i));
    assert.ok(view.getByText(/Listado visible/));
    fireEvent.click(view.getByRole("button", { name: "Reintentar localidades" }));
    fireEvent.click(view.getByRole("button", { name: "Reintentar formatos" }));
    assert.deepEqual(retries, ["facets", "formats"]);
  });
});
