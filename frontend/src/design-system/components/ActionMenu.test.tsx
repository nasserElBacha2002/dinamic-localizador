import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { Button, MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { ActionMenu } from "./ActionMenu";

afterEach(() => {
  cleanup();
});

describe("ActionMenu", () => {
  it("renders primary action and secondary menu items with aria-label", () => {
    const secondary: string[] = [];
    const view = render(
      <MantineProvider>
        <ActionMenu
          primary={<Button>Primaria</Button>}
          menuLabel="Más acciones de fila"
          items={[
            {
              key: "edit",
              label: "Editar",
              onClick: () => secondary.push("edit"),
            },
            {
              key: "delete",
              label: "Eliminar",
              destructive: true,
              onClick: () => secondary.push("delete"),
            },
          ]}
        />
      </MantineProvider>,
    );

    assert.ok(view.getByRole("button", { name: "Primaria" }));
    fireEvent.click(view.getByRole("button", { name: "Más acciones de fila" }));
    fireEvent.click(view.getByRole("menuitem", { name: "Editar" }));
    assert.deepEqual(secondary, ["edit"]);
  });

  it("stops propagation so parent click handlers do not fire", () => {
    const parentClicks: string[] = [];
    const itemClicks: string[] = [];

    const view = render(
      <MantineProvider>
        <div
          onClick={() => parentClicks.push("parent")}
          onKeyDown={() => undefined}
          role="presentation"
        >
          <ActionMenu
            items={[
              {
                key: "x",
                label: "Secundaria",
                onClick: () => itemClicks.push("item"),
              },
            ]}
            menuLabel="Menú"
          />
        </div>
      </MantineProvider>,
    );

    fireEvent.click(view.getByRole("button", { name: "Menú" }));
    fireEvent.click(view.getByRole("menuitem", { name: "Secundaria" }));
    assert.deepEqual(itemClicks, ["item"]);
    assert.deepEqual(parentClicks, []);
  });

  it("respects disabled items", () => {
    const clicks: string[] = [];
    const view = render(
      <MantineProvider>
        <ActionMenu
          menuLabel="Menú"
          items={[
            {
              key: "x",
              label: "Bloqueada",
              disabled: true,
              onClick: () => clicks.push("x"),
            },
          ]}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByRole("button", { name: "Menú" }));
    const item = view.getByRole("menuitem", { name: "Bloqueada" });
    assert.ok(item.getAttribute("data-disabled") !== null || (item as HTMLButtonElement).disabled);
    fireEvent.click(item);
    assert.deepEqual(clicks, []);
  });
});
