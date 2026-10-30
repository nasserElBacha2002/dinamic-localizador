/**
 * Policy dialog: calendar UI differs by day counting mode.
 */
import { setupDomEnvironment } from "../../../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";
import type { AbsenceType } from "../../../../types/absence";

const absenceTypes: AbsenceType[] = [
  {
    id: "type-calendar",
    code: "VACATION",
    name: "Vacaciones",
    description: null,
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: true,
    allowsHalfDay: true,
    dayCountingMode: "CALENDAR_DAYS",
    calendarId: null,
    isActive: true,
  },
  {
    id: "type-business",
    code: "STUDY_DAY",
    name: "Día de estudio",
    description: null,
    requiresApproval: true,
    requiresAttachment: false,
    deductsBalance: true,
    allowsHalfDay: false,
    dayCountingMode: "BUSINESS_DAYS",
    calendarId: null,
    isActive: true,
  },
];

mock.module("../../../../hooks/useAbsences", {
  namedExports: {
    useAbsenceTypes: () => ({
      data: absenceTypes,
      isError: false,
      error: null,
    }),
    useUpdateAbsenceType: () => ({
      isPending: false,
      mutateAsync: async () => undefined,
    }),
  },
});

mock.module("../../../../hooks/useAbsenceCalendar", {
  namedExports: {
    useAbsenceCalendars: () => ({
      data: [],
      isError: false,
      error: null,
    }),
  },
});

import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installLayoutPolyfills } from "../../../../test/layout-polyfills";
import { clearActiveTestQueryClients } from "../../../../test/render-page";

installLayoutPolyfills();

let renderPage: typeof import("../../../../test/render-page").renderPage;
let CompanyAbsenceTypePolicyDialog: typeof import("./CompanyAbsenceTypePolicyDialog").CompanyAbsenceTypePolicyDialog;

before(async () => {
  ({ renderPage } = await import("../../../../test/render-page"));
  ({ CompanyAbsenceTypePolicyDialog } = await import("./CompanyAbsenceTypePolicyDialog"));
});

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
});

describe("CompanyAbsenceTypePolicyDialog", () => {
  it("shows calendar picker only for business-day types", async () => {
    const view = renderPage(
      <CompanyAbsenceTypePolicyDialog
        opened
        onClose={() => undefined}
        canUpdate
        onSaved={() => undefined}
      />,
    );

    await waitFor(() => {
      assert.ok(view.getByText("Vacaciones"));
      assert.ok(view.getByText("Día de estudio"));
    });

    assert.ok(view.getByText("No aplica (días corridos)"));
    assert.equal(view.getAllByText("Calendario por defecto de la empresa").length, 1);
  });
});
