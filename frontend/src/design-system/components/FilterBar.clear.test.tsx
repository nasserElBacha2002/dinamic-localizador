import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import { mockViewport } from "../../test/mock-match-media";
import { FilterBar } from "./FilterBar";

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

function DesktopClearHarness() {
  const [status, setStatus] = useState("all");
  const activeCount = status !== "all" ? 1 : 0;

  return (
    <FilterBar
      activeFilterCount={activeCount}
      hasActiveFilters={activeCount > 0}
      onClearFilters={() => setStatus("all")}
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
    </FilterBar>
  );
}

describe("FilterBar clear filters (desktop)", () => {
  it("shows Limpiar filtros disabled at defaults and clears when active", async () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <DesktopClearHarness />
      </MantineProvider>,
    );

    const clearControl = view.getByLabelText("Limpiar filtros");
    assert.equal(clearControl.getAttribute("aria-disabled"), "true");

    fireEvent.change(view.getByLabelText("Estado"), { target: { value: "true" } });
    await waitFor(() => {
      assert.equal(view.getByLabelText("Limpiar filtros").getAttribute("aria-disabled"), null);
    });

    fireEvent.click(view.getByLabelText("Limpiar filtros"));
    await waitFor(() => {
      assert.equal((view.getByLabelText("Estado") as HTMLSelectElement).value, "all");
      assert.equal(view.getByLabelText("Limpiar filtros").getAttribute("aria-disabled"), "true");
    });
  });
});
