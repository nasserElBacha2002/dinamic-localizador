import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useTableUrlState } from "./useTableUrlState";
import {
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
  shouldOmitServiceTableValue,
} from "../pages/services/services-list-table-state";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  setupDomEnvironment();
});

function ServicesTableHarness() {
  const location = useLocation();
  const table = useTableUrlState({
    defaults: SERVICE_TABLE_DEFAULTS,
    fields: SERVICE_TABLE_FIELDS,
    shouldOmitFromUrl: (key, value, defaults) =>
      shouldOmitServiceTableValue(key, value, defaults),
  });

  return (
    <div>
      <span data-testid="url">{`${location.pathname}${location.search}`}</span>
      <span data-testid="page">{table.page}</span>
      <span data-testid="locality">{table.state.locality}</span>
      <span data-testid="neighborhood">{table.state.neighborhood}</span>
      <span data-testid="search">{table.state.search}</span>
      <span data-testid="serviceFormat">{table.state.serviceFormat}</span>
      <span data-testid="active">{table.state.active}</span>
      <span data-testid="sortBy">{table.state.sortBy}</span>
      <span data-testid="sortOrder">{table.state.sortOrder}</span>
      <button
        type="button"
        onClick={() =>
          table.setState({
            locality: "CABA",
            neighborhood: "",
            search: "central",
            serviceFormat: "SUPER",
            active: "true",
            sortBy: "name",
            sortOrder: "asc",
          })
        }
      >
        Patch compuesto
      </button>
      <button
        type="button"
        onClick={() => {
          table.setField("locality", "CABA");
          table.setField("neighborhood", "");
        }}
      >
        Cascade secuencial
      </button>
      <button type="button" onClick={() => table.setPage(3)}>
        Página 3
      </button>
      <button
        type="button"
        onClick={() => table.setState({ locality: "GBA", neighborhood: "" })}
      >
        Cambiar localidad
      </button>
      <button
        type="button"
        onClick={() => {
          table.setState({ locality: "CABA", neighborhood: "" });
          table.setState({ locality: "GBA", neighborhood: "" });
          table.setState({ locality: "CABA", neighborhood: "Palermo" });
        }}
      >
        Cambios rápidos
      </button>
    </div>
  );
}

function renderServicesTable(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/services" element={<ServicesTableHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useTableUrlState atomic service filters", () => {
  it("applies a multi-field patch atomically and resets page", async () => {
    const view = renderServicesTable("/services?page=4");
    fireEvent.click(view.getByRole("button", { name: "Patch compuesto" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("page").textContent, "1");
      assert.equal(view.getByTestId("locality").textContent, "CABA");
      assert.equal(view.getByTestId("neighborhood").textContent, "");
      assert.equal(view.getByTestId("search").textContent, "central");
      assert.equal(view.getByTestId("serviceFormat").textContent, "SUPER");
      assert.equal(view.getByTestId("active").textContent, "true");
      assert.equal(view.getByTestId("sortBy").textContent, "name");
      assert.equal(view.getByTestId("sortOrder").textContent, "asc");
    });

    const url = view.getByTestId("url").textContent ?? "";
    assert.match(url, /locality=CABA/);
    assert.doesNotMatch(url, /neighborhood=/);
    assert.match(url, /search=central/);
    assert.match(url, /serviceFormat=SUPER/);
  });

  it("keeps locality when clearing neighborhood via sequential setField", async () => {
    const view = renderServicesTable("/services?page=2&search=x&serviceFormat=SUPER&active=true");
    fireEvent.click(view.getByRole("button", { name: "Cascade secuencial" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("locality").textContent, "CABA");
      assert.equal(view.getByTestId("neighborhood").textContent, "");
      assert.equal(view.getByTestId("search").textContent, "x");
      assert.equal(view.getByTestId("serviceFormat").textContent, "SUPER");
      assert.equal(view.getByTestId("active").textContent, "true");
      assert.equal(view.getByTestId("page").textContent, "1");
    });
  });

  it("preserves filters across rapid locality changes", async () => {
    const view = renderServicesTable(
      "/services?search=abc&serviceFormat=SUPER&sortBy=name&sortOrder=asc",
    );
    fireEvent.click(view.getByRole("button", { name: "Cambios rápidos" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("locality").textContent, "CABA");
      assert.equal(view.getByTestId("neighborhood").textContent, "Palermo");
      assert.equal(view.getByTestId("search").textContent, "abc");
      assert.equal(view.getByTestId("serviceFormat").textContent, "SUPER");
      assert.equal(view.getByTestId("sortBy").textContent, "name");
    });
  });

  it("restores locality and neighborhood from URL and ignores orphan neighborhood without locality filter send path", async () => {
    const view = renderServicesTable("/services?locality=CABA&neighborhood=Palermo&page=2");
    assert.equal(view.getByTestId("locality").textContent, "CABA");
    assert.equal(view.getByTestId("neighborhood").textContent, "Palermo");
    assert.equal(view.getByTestId("page").textContent, "2");

    fireEvent.click(view.getByRole("button", { name: "Cambiar localidad" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("locality").textContent, "GBA");
      assert.equal(view.getByTestId("neighborhood").textContent, "");
      assert.equal(view.getByTestId("page").textContent, "1");
    });
  });

  it("falls back invalid sortBy from URL", () => {
    const view = renderServicesTable("/services?sortBy=hacked;drop&sortOrder=nope");
    assert.equal(view.getByTestId("sortBy").textContent, "createdAt");
    assert.equal(view.getByTestId("sortOrder").textContent, "desc");
  });
});
