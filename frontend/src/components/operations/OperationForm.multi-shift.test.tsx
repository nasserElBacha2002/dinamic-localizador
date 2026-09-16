/**
 * OperationForm create: schedule mode SINGLE vs MULTI_SHIFT UI.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";

mock.module("../../hooks/useShiftTemplates", {
  namedExports: {
    useShiftTemplates: () => ({
      data: [
        {
          id: "tpl-1",
          companyId: "co-1",
          code: "MANANA",
          name: "Mañana",
          startTime: "08:00",
          endTime: "16:00",
          sortOrder: 0,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isPending: false,
      isError: false,
      error: null,
    }),
  },
});

import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../test/layout-polyfills";
import { mockViewport } from "../../test/mock-match-media";
import { buildOperationCreateDefaultValues } from "../../utils/operation-create-defaults";
import type { CompanySettings } from "../../types/company-settings";

installLayoutPolyfills();

const settings: CompanySettings = {
  companyId: "co-1",
  operationTimezone: "America/Argentina/Buenos_Aires",
  defaultRadiusMeters: 100,
  lateGraceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  defaultEarlyArrivalToleranceMinutes: 60,
  defaultLateArrivalToleranceMinutes: 15,
  defaultOperationStartTime: "09:00",
  defaultOperationEndTime: "18:00",
  geofenceReviewMarginMeters: 50,
  confirmationReminderEnabled: false,
  confirmationReminderHoursBefore: 24,
  pendingOperationExpirationHours: 48,
  adminAlertsEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let renderPage: typeof import("../../test/render-page").renderPage;
let OperationForm: typeof import("./OperationForm").OperationForm;

before(async () => {
  ({ renderPage } = await import("../../test/render-page"));
  ({ OperationForm } = await import("./OperationForm"));
});

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("OperationForm multi-shift create", () => {
  it("reveals shift builder when selecting Múltiples turnos", async () => {
    mockViewport("desktop");
    const view = renderPage(
      <OperationForm
        mode="create"
        defaultValues={buildOperationCreateDefaultValues(settings)}
        submitLabel="Crear operación"
        cancelTo="/operations"
        onSubmit={async () => undefined}
      />,
    );

    assert.ok(view.getByText(/Horario único/i));
    assert.ok(view.getByText(/Múltiples turnos/i));

    fireEvent.click(view.getByText(/Múltiples turnos/i));

    await waitFor(() => {
      assert.ok(view.getByText(/Turnos iniciales/i));
      assert.ok(view.getByRole("button", { name: /Turno personalizado/i }));
      assert.ok(view.getByText(/Agregá al menos un turno/i));
    });
  });
});
