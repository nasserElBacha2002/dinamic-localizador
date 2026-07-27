import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import { useDebouncedValueController } from "./useDebouncedValue";

afterEach(() => {
  cleanup();
});

describe("useDebouncedValueController", () => {
  it("cancels a pending timer so a later value is not applied from a stale generation", async () => {
    function Harness() {
      const [value, setValue] = useState("a");
      const { value: debounced, cancel } = useDebouncedValueController(value, 40);
      return (
        <div>
          <span data-testid="debounced">{debounced}</span>
          <button type="button" onClick={() => setValue("stale")}>
            set-stale
          </button>
          <button
            type="button"
            onClick={() => {
              cancel();
              setValue("fresh");
            }}
          >
            cancel-and-fresh
          </button>
        </div>
      );
    }

    const view = render(<Harness />);
    assert.equal(view.getByTestId("debounced").textContent, "a");

    fireEvent.click(view.getByRole("button", { name: "set-stale" }));
    fireEvent.click(view.getByRole("button", { name: "cancel-and-fresh" }));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    // After cancel, only the "fresh" debounce generation should land.
    assert.equal(view.getByTestId("debounced").textContent, "fresh");
  });

  it("updates after delay when not cancelled", async () => {
    function Controlled() {
      const [value, setValue] = useState("a");
      const { value: debounced } = useDebouncedValueController(value, 30);
      return (
        <div>
          <button type="button" onClick={() => setValue("b")}>
            change
          </button>
          <span data-testid="debounced">{debounced}</span>
        </div>
      );
    }

    const view = render(<Controlled />);
    assert.equal(view.getByTestId("debounced").textContent, "a");
    fireEvent.click(view.getByRole("button", { name: "change" }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.equal(view.getByTestId("debounced").textContent, "b");
  });
});
