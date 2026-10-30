import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mockApiModule, ABSENCES_API_EXPORTS } from "../../test/mock-api-module";
import { setRuntimeCompanyId } from "../../api/company-path";
import { installLayoutPolyfills } from "../../test/layout-polyfills";

setRuntimeCompanyId("co-1");
installLayoutPolyfills();

const TYPE_VACATION = "type-vacation";
const TYPE_OTHER = "type-other";

let balanceRows: import("../../types/absence").EmployeeAbsenceBalanceSummary[] = [];

mockApiModule(
  "api/absences.api",
  {
    getAbsenceTypes: async () => [],
    getAbsenceRequests: async () => ({
      data: [],
      meta: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    }),
    getAbsenceRequestById: async () => {
      throw new Error("not used");
    },
    getEmployeeAbsenceBalances: async () => balanceRows,
  },
  ABSENCES_API_EXPORTS,
);

import assert from "node:assert/strict";
import { cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { renderPage, clearActiveTestQueryClients } from "../../test/render-page";
import { EmployeeAbsenceBalanceCard } from "./EmployeeAbsenceBalanceCard";

afterEach(() => {
  cleanup();
  clearActiveTestQueryClients();
  balanceRows = [];
});

describe("EmployeeAbsenceBalanceCard balance warnings", () => {
  it("non-deducting request type does not show negative warning for other types", async () => {
    balanceRows = [
      {
        absenceType: {
          id: TYPE_OTHER,
          code: "SICK",
          name: "Enfermedad",
          deductsBalance: true,
        },
        year: 2026,
        assignedDays: 5,
        approvedDays: 10,
        pendingDays: 0,
        rejectedDays: 0,
        cancelledDays: 0,
        availableDays: -3,
        projectedAvailableDays: -3,
        notes: null,
      },
    ];

    const view = renderPage(
      <EmployeeAbsenceBalanceCard
        employeeId="emp-1"
        year={2026}
        currentAbsenceTypeId={TYPE_VACATION}
        balanceImpact={{
          deductsBalance: false,
          year: 2026,
          requestDays: 1,
          message: "Este tipo de ausencia no descuenta saldo.",
        }}
        showEdit={false}
        collapseFullBalance
      />,
    );

    await waitFor(() => {
      assert.match(view.container.textContent ?? "", /no descuenta saldo/i);
    });
    assert.doesNotMatch(
      view.container.textContent ?? "",
      /saldo negativo para este tipo de ausencia/i,
    );
  });

  it("deducting request with insufficient balance shows warning and collapsed table", async () => {
    balanceRows = [
      {
        absenceType: {
          id: TYPE_VACATION,
          code: "VACATION",
          name: "Vacaciones",
          deductsBalance: true,
        },
        year: 2026,
        assignedDays: 2,
        approvedDays: 0,
        pendingDays: 2,
        rejectedDays: 0,
        cancelledDays: 0,
        availableDays: 2,
        projectedAvailableDays: 0,
        notes: null,
      },
    ];

    const view = renderPage(
      <EmployeeAbsenceBalanceCard
        employeeId="emp-1"
        year={2026}
        currentAbsenceTypeId={TYPE_VACATION}
        balanceImpact={{
          deductsBalance: true,
          year: 2026,
          requestDays: 3,
          availableAfterApproval: -1,
          hasSufficientBalance: false,
        }}
        showEdit={false}
        collapseFullBalance
      />,
    );

    await waitFor(() => {
      assert.match(view.container.textContent ?? "", /no tiene saldo suficiente/i);
    });
    assert.equal(view.queryByLabelText("Saldo de ausencias del empleado"), null);

    const user = userEvent.setup({ document: globalThis.document });
    await user.click(view.getByRole("button", { name: /Ver saldo del empleado/i }));
    await waitFor(() => {
      assert.ok(view.getByRole("button", { name: /Ocultar saldo/i }));
    });
  });
});
