import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cleanup, render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import React from "react";
import { MemoryRouter } from "react-router";
import { DetailFieldGrid } from "./DetailFieldGrid";
import { DISPLAY_FALLBACK } from "../../utils/display-safe";

describe("DetailFieldGrid", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders labels, empty fallback, React values, and long text without overflow style break", () => {
    const { container, getByText, getByTestId } = render(
      <MemoryRouter>
        <MantineProvider>
          <DetailFieldGrid
            fields={[
              { label: "Vacío", value: null },
              { label: "Espacios", value: "   " },
              { label: "Badge", value: <span data-testid="react-value">OK</span> },
              {
                label: "Largo",
                value: "x".repeat(120),
                span: { base: 12, sm: 12, lg: 12 },
              },
            ]}
          />
        </MantineProvider>
      </MemoryRouter>,
    );

    assert.equal(getByText("Vacío").textContent, "Vacío");
    const emptyValues = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.textContent === DISPLAY_FALLBACK,
    );
    assert.ok(emptyValues.length >= 2);
    assert.ok(getByTestId("react-value"));
    assert.match(getByText("x".repeat(120)).getAttribute("style") ?? "", /overflow-wrap/);
  });
});
