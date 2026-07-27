import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import { mockViewport } from "../../test/mock-match-media";
import { FilterBar } from "./FilterBar";

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

function ControlledFiltersHarness({ withClear = false }: { withClear?: boolean }) {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const activeCount = (status !== "all" ? 1 : 0) + (category !== "all" ? 1 : 0);

  return (
    <FilterBar
      search={
        <label htmlFor="filterbar-search">
          Buscar
          <input id="filterbar-search" defaultValue="" />
        </label>
      }
      activeFilterCount={withClear ? activeCount : undefined}
      onClearFilters={
        withClear
          ? () => {
              setStatus("all");
              setCategory("all");
            }
          : undefined
      }
    >
      <FilterBar.Item>
        <label>
          Estado
          <select
            aria-label="Estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="true">Activos</option>
          </select>
        </label>
      </FilterBar.Item>
      <FilterBar.Item>
        <label>
          Categoría
          <select
            aria-label="Categoría"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">Todas</option>
            <option value="ops">Ops</option>
          </select>
        </label>
      </FilterBar.Item>
    </FilterBar>
  );
}

describe("FilterBar responsive", () => {
  it("shows search and secondary filters on desktop", () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <ControlledFiltersHarness />
      </MantineProvider>,
    );

    assert.ok(view.getByLabelText("Buscar"));
    assert.ok(view.getByLabelText("Estado"));
    assert.ok(view.getByLabelText("Categoría"));
    assert.equal(view.queryByRole("button", { name: /Filtros/i }), null);
  });

  it("keeps search visible and opens secondary filters in a drawer on mobile", async () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <ControlledFiltersHarness />
      </MantineProvider>,
    );

    assert.ok(view.getByLabelText("Buscar"));
    const filtersButton = view.getByRole("button", { name: /Filtros/i });
    assert.ok(filtersButton);

    fireEvent.click(filtersButton);
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("dialog"));
    });
    assert.ok(within(document.body).getByLabelText("Estado"));
  });
});
