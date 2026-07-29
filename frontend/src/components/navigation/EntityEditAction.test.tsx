import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { EntityEditAction } from "./EntityEditAction";

function StateProbe() {
  const location = useLocation();
  return <div data-testid="state">{JSON.stringify(location.state)}</div>;
}

describe("EntityEditAction", () => {
  afterEach(() => {
    cleanup();
  });

  it("links to /:id/edit and preserves location.state on navigation", () => {
    const view = render(
      <MemoryRouter
        initialEntries={[{ pathname: "/employees/e1", state: { fromList: true, page: 2 } }]}
      >
        <MantineProvider>
          <Routes>
            <Route
              path="/employees/e1"
              element={
                <>
                  <EntityEditAction entity="employees" id="e1" />
                  <StateProbe />
                </>
              }
            />
            <Route
              path="/employees/e1/edit"
              element={
                <>
                  <div>EDIT_PAGE</div>
                  <StateProbe />
                </>
              }
            />
          </Routes>
        </MantineProvider>
      </MemoryRouter>,
    );

    const link = within(view.container).getByRole("link", { name: "Editar" });
    assert.equal(link.getAttribute("href"), "/employees/e1/edit");
    fireEvent.click(link);
    assert.ok(within(view.container).getByText("EDIT_PAGE"));
    assert.equal(
      within(view.container).getByTestId("state").textContent,
      JSON.stringify({ fromList: true, page: 2 }),
    );
  });
});
