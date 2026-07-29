import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cleanup, render, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import React from "react";
import { MemoryRouter } from "react-router";
import { EntityEditAction } from "./EntityEditAction";

describe("EntityEditAction", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Editar link to /:id/edit when visible", () => {
    const view = render(
      <MemoryRouter initialEntries={[{ pathname: "/employees/e1", state: { fromList: true } }]}>
        <MantineProvider>
          <EntityEditAction entity="employees" id="e1" />
        </MantineProvider>
      </MemoryRouter>,
    );
    const link = within(view.container).getByRole("link", { name: "Editar" });
    assert.equal(link.getAttribute("href"), "/employees/e1/edit");
  });

  it("renders nothing when not visible", () => {
    const view = render(
      <MemoryRouter>
        <MantineProvider>
          <EntityEditAction entity="employees" id="e1" visible={false} />
        </MantineProvider>
      </MemoryRouter>,
    );
    assert.equal(within(view.container).queryByRole("link", { name: "Editar" }), null);
  });
});
