import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { StatusBadge } from "../../design-system/components/StatusBadge";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";

afterEach(() => {
  cleanup();
});

describe("AttendanceStatusBadge", () => {
  it("renders the full label on the badge and exposes it via tooltip", async () => {
    const label = "Pendiente / esperada";
    const view = render(
      <MantineProvider>
        <AttendanceStatusBadge label={label} tone="warning" />
      </MantineProvider>,
    );

    assert.ok(view.getByText(label));

    const focusTarget = view.getByText(label).closest("[tabindex]") as HTMLElement | null;
    assert.ok(focusTarget);
    assert.equal(focusTarget.tabIndex, 0);
    fireEvent.mouseEnter(focusTarget);

    await waitFor(() => {
      assert.ok(view.getByRole("tooltip", { name: label }));
    });
  });

  it("keeps StatusBadge label intact when tooltipLabel is set", async () => {
    const label = "Sin registrar";
    const view = render(
      <MantineProvider>
        <StatusBadge label={label} tone="neutral" tooltipLabel={label} />
      </MantineProvider>,
    );

    assert.ok(view.getByText(label));
    fireEvent.mouseEnter(view.getByText(label).closest("[tabindex]") as HTMLElement);

    await waitFor(() => {
      assert.ok(view.getByRole("tooltip", { name: label }));
    });
  });
});
