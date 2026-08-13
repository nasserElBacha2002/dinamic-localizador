import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { Button, MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";
import { EntityPageTitle, PageHeader } from "./PageHeader";

installLayoutPolyfills();

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

function renderHeader(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("PageHeader", () => {
  it("stacks title above actions on mobile without side-by-side collision", () => {
    mockViewport("mobile");
    const view = renderHeader(
      <PageHeader
        title={<EntityPageTitle name="Sucursal Centro" entityType="service" />}
        description="Detalle de servicio"
        action={<Button>Editar</Button>}
      />,
    );

    assert.ok(view.getByRole("heading", { level: 2 }));
    assert.ok(view.getByText("Sucursal Centro"));
    assert.ok(view.getByText("Detalle de servicio"));
    assert.ok(view.getByRole("button", { name: "Editar" }));
  });

  it("keeps title and actions on one row on desktop", () => {
    mockViewport("desktop");
    const view = renderHeader(
      <PageHeader
        title="Operaciones"
        description="Planificá operaciones"
        action={<Button>Nueva operación</Button>}
      />,
    );

    assert.ok(view.getByRole("heading", { level: 2, name: "Operaciones" }));
    assert.ok(view.getByRole("button", { name: "Nueva operación" }));
  });
});
