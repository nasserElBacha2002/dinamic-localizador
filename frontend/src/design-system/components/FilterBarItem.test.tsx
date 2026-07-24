import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { mockViewport } from "../../test/mock-match-media";
import { FilterBarItem } from "./FilterBarItem";

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("FilterBarItem", () => {
  it("keeps min-width 0 on mobile even with desktopMinWidth", () => {
    mockViewport("mobile");
    const { container } = render(
      <MantineProvider>
        <FilterBarItem desktopMinWidth={280}>
          <span>Filtro</span>
        </FilterBarItem>
      </MantineProvider>,
    );
    const item = container.querySelector("[data-has-desktop-min='true']") as HTMLElement;
    assert.ok(item);
    // CSS modules are stubbed in unit tests; assert no rigid inline minWidth that overflows mobile.
    assert.equal(item.style.minWidth, "");
    assert.equal(item.style.getPropertyValue("min-width"), "");
  });

  it("exposes desktop min width token for sm+ CSS", () => {
    mockViewport("desktop");
    const { container } = render(
      <MantineProvider>
        <FilterBarItem desktopMinWidth={280}>
          <span>Filtro</span>
        </FilterBarItem>
      </MantineProvider>,
    );
    const item = container.querySelector("[data-has-desktop-min='true']") as HTMLElement;
    assert.equal(item.style.getPropertyValue("--filter-item-desktop-min"), "280px");
  });
});
