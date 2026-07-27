import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { EntityIdentity } from "./EntityAvatar";

afterEach(() => {
  cleanup();
});

describe("EntityIdentity", () => {
  it("shows fallback title for null names", () => {
    const view = render(
      <MantineProvider>
        <EntityIdentity name={null} entityType="service" />
      </MantineProvider>,
    );
    assert.ok(view.getByText("Sin nombre"));
    assert.equal(view.container.querySelector("[data-entity-avatar='service']")?.textContent, "?");
  });

  it("shows fallback title for undefined names", () => {
    const view = render(
      <MantineProvider>
        <EntityIdentity name={undefined} entityType="service" />
      </MantineProvider>,
    );
    assert.ok(view.getByText("Sin nombre"));
  });

  it("shows fallback title for empty and whitespace names", () => {
    const empty = render(
      <MantineProvider>
        <EntityIdentity name="" entityType="service" />
      </MantineProvider>,
    );
    assert.ok(empty.getByText("Sin nombre"));
    cleanup();

    const spaces = render(
      <MantineProvider>
        <EntityIdentity name="   " entityType="service" />
      </MantineProvider>,
    );
    assert.ok(spaces.getByText("Sin nombre"));
  });

  it("renders valid name, subtitle, className, size, and shape", () => {
    const view = render(
      <MantineProvider>
        <EntityIdentity
          name="Ada Lovelace"
          entityType="collaborator"
          subtitle="Operaciones"
          className="identity-test"
          size="md"
          shape="rounded"
        />
      </MantineProvider>,
    );

    assert.ok(view.getByText("Ada Lovelace"));
    assert.ok(view.getByText("Operaciones"));
    assert.ok(view.container.querySelector(".identity-test"));
    const avatar = view.container.querySelector(
      "[data-entity-avatar='collaborator']",
    ) as HTMLElement;
    assert.equal(avatar.textContent, "AL");
    assert.equal(avatar.style.width, "40px");
  });
});
