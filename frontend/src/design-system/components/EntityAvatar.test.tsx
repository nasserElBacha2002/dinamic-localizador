import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { EntityAvatar } from "./EntityAvatar";
import { ENTITY_AVATAR_BRAND_TONE, ENTITY_AVATAR_SIZE_PX } from "./entity-avatar.constants";
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

    const avatar = view.container.querySelector("[data-entity-avatar='service']") as HTMLElement;
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
    assert.equal(view.container.querySelector("[data-entity-avatar='collaborator']")?.textContent, "JP");
  });

  it("renders fallback for empty names", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="" entityType="company" />
      </MantineProvider>,
    );
    assert.equal(view.container.querySelector("[data-entity-avatar='company']")?.textContent, "?");
  });

  it("keeps the same color across rerenders", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="Sucursal Centro" entityType="operation" size="md" />
      </MantineProvider>,
    );
    const first = (view.container.querySelector("[data-entity-avatar='operation']") as HTMLElement)
      .style.background;
    view.rerender(
      <MantineProvider>
        <EntityAvatar name="Sucursal Centro" entityType="operation" size="md" />
      </MantineProvider>,
    );
    const second = (view.container.querySelector("[data-entity-avatar='operation']") as HTMLElement)
      .style.background;
    assert.equal(first, second);
  });

  it("applies size dimensions including xs and sm", () => {
    const xs = render(
      <MantineProvider>
        <EntityAvatar name="Dinamic" entityType="company" size="xs" />
      </MantineProvider>,
    );
    const xsAvatar = xs.container.querySelector("[data-entity-avatar='company']") as HTMLElement;
    assert.equal(xsAvatar.style.width, `${ENTITY_AVATAR_SIZE_PX.xs}px`);
    assert.equal(xsAvatar.style.height, `${ENTITY_AVATAR_SIZE_PX.xs}px`);
    cleanup();

    const sm = render(
      <MantineProvider>
        <EntityAvatar name="Dinamic" entityType="company" size="sm" tone="brand" />
      </MantineProvider>,
    );
    const smAvatar = sm.container.querySelector("[data-entity-avatar='company']") as HTMLElement;
    assert.equal(smAvatar.style.width, `${ENTITY_AVATAR_SIZE_PX.sm}px`);
    assert.equal(smAvatar.style.height, `${ENTITY_AVATAR_SIZE_PX.sm}px`);
    assert.equal(smAvatar.style.background, ENTITY_AVATAR_BRAND_TONE.background);
  });

  it("uses decorative aria-hidden by default", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar name="Centro" entityType="service" />
      </MantineProvider>,
    );
    const avatar = view.container.querySelector("[data-entity-avatar='service']");
    assert.ok(avatar);
    assert.equal(avatar?.getAttribute("aria-hidden"), "true");
    assert.equal(avatar?.getAttribute("role"), null);
  });

  it("supports non-decorative mode with role and aria-label", () => {
    const view = render(
      <MantineProvider>
        <EntityAvatar
          name="Centro"
          entityType="service"
          decorative={false}
          ariaLabel="Servicio Centro"
        />
      </MantineProvider>,
    );
    const avatar = view.getByRole("img", { name: "Servicio Centro" });
    assert.equal(avatar.getAttribute("aria-hidden"), null);
    assert.equal(avatar.textContent, "C");
  });
});
