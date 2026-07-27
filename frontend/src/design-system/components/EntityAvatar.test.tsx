import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { EntityAvatar } from "./EntityAvatar";
import { getEntityAvatarColor, getEntityInitials } from "./entity-avatar.utils";

afterEach(() => {
  cleanup();
});

describe("EntityAvatar", () => {
  it("renders service initial and applies deterministic palette styles", () => {
    const initials = getEntityInitials("Limpieza industrial", 1);
    const palette = getEntityAvatarColor(initials, "service");
    const view = render(
      <MantineProvider>
        <EntityAvatar name="Limpieza industrial" entityType="service" size="sm" />
      </MantineProvider>,
    );

    const avatar = view.container.querySelector("[aria-hidden='true']") as HTMLElement;
    assert.ok(avatar);
    assert.equal(avatar.textContent, "L");
    assert.equal(avatar.style.background, palette.background);
    assert.equal(avatar.style.color, palette.color);
  });

  it("renders two initials for collaborators", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="Juan Pérez" entityType="collaborator" />
      </MantineProvider>,
    );
    assert.equal(view.container.querySelector("[aria-hidden='true']")?.textContent, "JP");
  });

  it("renders fallback for empty names", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="" entityType="company" />
      </MantineProvider>,
    );
    assert.equal(view.container.querySelector("[aria-hidden='true']")?.textContent, "?");
  });

  it("keeps the same color across rerenders", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="Sucursal Centro" entityType="operation" size="md" />
      </MantineProvider>,
    );
    const first = (view.container.querySelector("[aria-hidden='true']") as HTMLElement).style
      .background;
    view.rerender(
      <MantineProvider>
        <EntityAvatar name="Sucursal Centro" entityType="operation" size="md" />
      </MantineProvider>,
    );
    const second = (view.container.querySelector("[aria-hidden='true']") as HTMLElement).style
      .background;
    assert.equal(first, second);
  });

  it("applies size dimensions", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="Dinamic" entityType="company" size="lg" />
      </MantineProvider>,
    );
    const avatar = view.container.querySelector("[aria-hidden='true']") as HTMLElement;
    assert.equal(avatar.style.width, "48px");
    assert.equal(avatar.style.height, "48px");
  });
});
