import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React, { useState } from "react";
import { mockViewport } from "../../test/mock-match-media";
import { FilterBar } from "./FilterBar";

beforeEach(() => {
  mockViewport("desktop");
});

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

describe("FilterBar clear filters", () => {
  it("shows Limpiar filtros disabled at defaults and clears when active on desktop", async () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <DesktopClearHarness />
      </MantineProvider>,
    );

    const clearButton = () =>
      view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement;
    assert.equal(clearButton().disabled, true);
    assert.equal(clearButton().type, "button");

    fireEvent.change(view.getByLabelText("Estado"), { target: { value: "true" } });
    await waitFor(() => {
      assert.equal(clearButton().disabled, false);
    });

    fireEvent.click(clearButton());
    await waitFor(() => {
      assert.equal((view.getByLabelText("Estado") as HTMLSelectElement).value, "all");
      assert.equal(clearButton().disabled, true);
    });
  });
});
