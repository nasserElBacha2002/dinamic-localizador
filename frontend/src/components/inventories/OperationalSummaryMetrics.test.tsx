import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { OperationalSummaryMetrics } from "./OperationalSummaryMetrics";

afterEach(() => {
  cleanup();
});

describe("OperationalSummaryMetrics", () => {
  it("renders grouped confirmation and attendance metrics", () => {
    const view = render(
      <MantineProvider>
        <OperationalSummaryMetrics
          summary={{
            assigned: 3,
            confirmedEmployees: 1,
            pendingConfirmationEmployees: 1,
            unavailableEmployees: 1,
            checkedIn: 2,
            valid: 1,
            pendingReview: 1,
            rejected: 0,
            withoutCheckIn: 1,
          }}
        />
      </MantineProvider>,
    );

    assert.ok(view.getByText("Confirmación"));
    assert.ok(view.getByText("Asistencia"));
    assert.ok(view.getByText("Asignados"));
    assert.ok(view.getByText("Con check-in"));
    assert.ok(view.getByText("A revisar"));
  });
});
