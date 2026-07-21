import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import React from "react";
import { EmployeeDeactivationDialog } from "./EmployeeDeactivationDialog";
import { buildDeactivationSummaryMessage } from "./employee-deactivation-copy";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";

const impactFixture = (): EmployeeDeactivationImpact => ({
  collaboratorId: "11111111-1111-1111-1111-111111111111",
  canDeactivateDirectly: false,
  requiresConfirmation: true,
  affectedAssignmentsCount: 1,
  affectedWorkdaysCount: 2,
  affectedAssignments: [
    {
      assignmentId: "22222222-2222-2222-2222-222222222222",
      operationId: "33333333-3333-3333-3333-333333333333",
      operationName: "Inventario Palermo",
      operationType: "RECURRING",
      workdayId: "44444444-4444-4444-4444-444444444444",
      employeeWorkdayId: "55555555-5555-5555-5555-555555555555",
      date: "2026-07-25",
      startTime: "09:00",
      endTime: "14:00",
      status: "SCHEDULED",
      locationName: "Sucursal Palermo",
      workTeamName: "Equipo Norte",
    },
  ],
  activeWorkTeamMemberships: [
    {
      workTeamId: "66666666-6666-6666-6666-666666666666",
      workTeamName: "Equipo Norte",
    },
  ],
});

const renderDialog = (ui: React.ReactElement) => {
  const view = render(<MantineProvider>{ui}</MantineProvider>);
  return { ...view, queries: within(view.container) };
};

describe("employee deactivation UI", () => {
  afterEach(() => {
    cleanup();
  });

  it("builds a summary that distinguishes workdays and assignments", () => {
    assert.equal(
      buildDeactivationSummaryMessage({
        affectedAssignmentsCount: 1,
        affectedWorkdaysCount: 5,
      }),
      "Se quitarán 5 jornadas futuras correspondientes a 1 asignación. Las operaciones ya finalizadas y el historial de asistencia no serán modificados.",
    );
  });

  it("renders modal details and confirms once", () => {
    let confirms = 0;
    const impact = impactFixture();

    const { queries } = renderDialog(
      <EmployeeDeactivationDialog
        open
        employeeName="Ada Lovelace"
        impact={impact}
        onConfirm={() => {
          confirms += 1;
        }}
        onCancel={() => undefined}
      />,
    );

    assert.ok(queries.getByText("Desactivar colaborador"));
    assert.ok(queries.getByText("Inventario Palermo"));
    assert.ok(queries.getByText("Sucursal Palermo"));
    assert.ok(queries.getByText("Equipo Norte"));
    assert.ok(queries.getByText(/Se quitarán 2 jornadas futuras correspondientes a 1 asignación/));

    fireEvent.click(queries.getByRole("button", { name: "Desactivar y desasignar" }));
    assert.equal(confirms, 1);
  });

  it("disables actions while loading", () => {
    const { queries } = renderDialog(
      <EmployeeDeactivationDialog
        open
        employeeName="Ada Lovelace"
        impact={impactFixture()}
        loading
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    assert.equal(
      (queries.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled,
      true,
    );
  });

  it("cancels without confirming and shows endpoint errors", () => {
    let confirms = 0;
    let cancels = 0;

    const { queries } = renderDialog(
      <EmployeeDeactivationDialog
        open
        employeeName="Ada Lovelace"
        impact={impactFixture()}
        errorMessage="El teléfono ya está registrado"
        onConfirm={() => {
          confirms += 1;
        }}
        onCancel={() => {
          cancels += 1;
        }}
      />,
    );

    assert.ok(queries.getByText("El teléfono ya está registrado"));
    fireEvent.click(queries.getByRole("button", { name: "Cancelar" }));
    assert.equal(cancels, 1);
    assert.equal(confirms, 0);
  });

  it("shows zero-impact summary copy", () => {
    assert.equal(
      buildDeactivationSummaryMessage({
        affectedAssignmentsCount: 0,
        affectedWorkdaysCount: 0,
      }),
      "No hay asignaciones activas o futuras para desasignar. Las operaciones ya finalizadas y el historial de asistencia no serán modificados.",
    );
  });
});
