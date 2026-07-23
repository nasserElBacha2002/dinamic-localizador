import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { Button, MantineProvider, ScrollArea } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { ActionMenu } from "./ActionMenu";

installLayoutPolyfills();

afterEach(() => {
  cleanup();
});

function renderWithMenu(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("ActionMenu", () => {
  it("renders primary action and secondary menu items with aria-label", async () => {
    const secondary: string[] = [];
    const view = renderWithMenu(
      <ActionMenu
        primary={<Button>Primaria</Button>}
        menuLabel="Más acciones de fila"
        items={[
          { key: "edit", label: "Editar", onClick: () => secondary.push("edit") },
          {
            key: "delete",
            label: "Eliminar",
            destructive: true,
            onClick: () => secondary.push("delete"),
          },
        ]}
      />,
    );

    assert.ok(view.getByRole("button", { name: "Primaria" }));
    fireEvent.click(view.getByRole("button", { name: "Más acciones de fila" }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("menuitem", { name: "Editar" }));
    });
    fireEvent.click(within(document.body).getByRole("menuitem", { name: "Editar" }));
    assert.deepEqual(secondary, ["edit"]);
  });

  it("stops propagation so parent click handlers do not fire", async () => {
    const parentClicks: string[] = [];
    const itemClicks: string[] = [];

    const view = renderWithMenu(
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
      </div>,
    );

    fireEvent.click(view.getByRole("button", { name: "Menú" }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("menuitem", { name: "Secundaria" }));
    });
    fireEvent.click(within(document.body).getByRole("menuitem", { name: "Secundaria" }));
    assert.deepEqual(itemClicks, ["item"]);
    assert.deepEqual(parentClicks, []);
  });

  it("respects disabled and loading items", async () => {
    const clicks: string[] = [];
    const view = renderWithMenu(
      <ActionMenu
        menuLabel="Menú"
        items={[
          {
            key: "disabled",
            label: "Bloqueada",
            disabled: true,
            onClick: () => clicks.push("disabled"),
          },
          {
            key: "loading",
            label: "Cargando",
            loading: true,
            onClick: () => clicks.push("loading"),
          },
        ]}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Menú" }));
    await waitFor(() => {
      assert.ok(within(document.body).getByRole("menuitem", { name: "Bloqueada" }));
    });
    fireEvent.click(within(document.body).getByRole("menuitem", { name: "Bloqueada" }));
    fireEvent.click(within(document.body).getByRole("menuitem", { name: "Cargando" }));
    assert.deepEqual(clicks, []);
    assert.ok(within(document.body).getByRole("menuitem", { name: "Cargando" }).getAttribute("aria-busy"));
  });

  it("escapes ScrollArea via portal", async () => {
    const view = renderWithMenu(
      <ScrollArea h={80} style={{ overflow: "hidden" }}>
        <div style={{ height: 200 }}>
          <ActionMenu
            menuLabel="Menú scroll"
            items={[{ key: "a", label: "Acción portal", onClick: () => undefined }]}
          />
        </div>
      </ScrollArea>,
    );

    fireEvent.click(view.getByRole("button", { name: "Menú scroll" }));
    await waitFor(() => {
      const item = within(document.body).getByRole("menuitem", { name: "Acción portal" });
      assert.ok(item);
      assert.equal(view.container.contains(item), false);
    });
  });

  it("uses Mantine Menu with portal (Escape/focus managed by Floating UI)", () => {
    const view = renderWithMenu(
      <ActionMenu menuLabel="Menú a11y" items={[{ key: "a", label: "Ítem", onClick: () => undefined }]} />,
    );
    const trigger = view.getByRole("button", { name: "Menú a11y" });
    assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  });
});
