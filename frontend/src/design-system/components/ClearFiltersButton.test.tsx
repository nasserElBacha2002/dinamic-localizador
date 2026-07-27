import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { ClearFiltersButton } from "./ClearFiltersButton";

afterEach(() => {
  cleanup();
});

describe("ClearFiltersButton", () => {
  it("renders Limpiar filtros and invokes onClick once", () => {
    let clicks = 0;
    const view = render(
      <ClearFiltersButton
        onClick={() => {
          clicks += 1;
        }}
      />,
    );

    const control = view.getByLabelText("Limpiar filtros");
    fireEvent.click(control);
    assert.equal(clicks, 1);
  });

  it("is inert when filters are at defaults", () => {
    let clicks = 0;
    const view = render(
      <ClearFiltersButton
        disabled
        onClick={() => {
          clicks += 1;
        }}
      />,
    );

    const control = view.getByLabelText("Limpiar filtros");
    assert.equal(control.getAttribute("aria-disabled"), "true");
    fireEvent.click(control);
    assert.equal(clicks, 0);
  });

  it("supports keyboard activation", () => {
    let clicks = 0;
    const view = render(
      <ClearFiltersButton
        onClick={() => {
          clicks += 1;
        }}
      />,
    );

    fireEvent.keyDown(view.getByLabelText("Limpiar filtros"), { key: "Enter" });
    assert.equal(clicks, 1);
  });
});
