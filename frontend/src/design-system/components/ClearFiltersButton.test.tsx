import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { ClearFiltersButton } from "./ClearFiltersButton";

afterEach(() => {
  cleanup();
});

describe("ClearFiltersButton", () => {
  it("renders a native button named Limpiar filtros", () => {
    const view = render(
      <MantineProvider>
        <ClearFiltersButton onClick={() => undefined} />
      </MantineProvider>,
    );

    const button = view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement;
    assert.equal(button.disabled, false);
    assert.equal(button.type, "button");
  });

  it("invokes onClick when enabled", () => {
    let clicks = 0;
    const view = render(
      <MantineProvider>
        <ClearFiltersButton
          onClick={() => {
            clicks += 1;
          }}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));
    assert.equal(clicks, 1);
  });

  it("uses native disabled and does not fire when inactive", () => {
    let clicks = 0;
    const view = render(
      <MantineProvider>
        <ClearFiltersButton
          disabled
          onClick={() => {
            clicks += 1;
          }}
        />
      </MantineProvider>,
    );

    const button = view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement;
    assert.equal(button.disabled, true);
    fireEvent.click(button);
    assert.equal(clicks, 0);
  });

  it("is keyboard-focusable when enabled", () => {
    const view = render(
      <MantineProvider>
        <ClearFiltersButton onClick={() => undefined} />
      </MantineProvider>,
    );

    const button = view.getByRole("button", { name: "Limpiar filtros" }) as HTMLButtonElement;
    button.focus();
    assert.equal(document.activeElement, button);
    // Native button activation (Enter/Space) is handled by the browser / Mantine Button.
    // userEvent.setup() is incompatible with this suite's happy-dom document symbol.
    fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
  });
});
