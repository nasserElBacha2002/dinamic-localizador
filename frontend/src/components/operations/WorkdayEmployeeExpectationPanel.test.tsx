import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import type { OperationWorkdayEmployeeSummary } from "../../types/operation-workday";
import { WorkdayEmployeeExpectationPanel } from "./WorkdayEmployeeExpectationPanel";

function renderPanel(employee: OperationWorkdayEmployeeSummary) {
  return render(
    <MemoryRouter>
      <MantineProvider>
        <WorkdayEmployeeExpectationPanel employee={employee} />
      </MantineProvider>
    </MemoryRouter>,
  );
}

const baseEmployee = (
  overrides: Partial<OperationWorkdayEmployeeSummary> = {},
): OperationWorkdayEmployeeSummary => ({
  employeeId: "emp-1",
  employeeName: "Ana Test",
  expectationStatus: "EXPECTED",
  effectiveState: "EXPECTED",
  absenceContext: null,
  hasAttendanceConflict: false,
  ...overrides,
});

describe("WorkdayEmployeeExpectationPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders Justificado for justified workdays", () => {
    const view = renderPanel(
      baseEmployee({
        effectiveState: "JUSTIFIED",
        expectationStatus: "JUSTIFIED",
        absenceContext: {
          absenceRequestId: "absence-1",
          absenceTypeName: "Vacaciones",
          absenceStartDate: "2026-08-01",
          absenceEndDate: "2026-08-14",
          hasAttendanceConflict: false,
        },
      }),
    );

    assert.match(view.container.textContent ?? "", /Justificado/);
    assert.match(view.container.textContent ?? "", /Vacaciones/);
    assert.match(view.container.innerHTML, /\/absences\/absence-1/);
  });

  it("renders Ausente and Con asistencia states", () => {
    const absentView = renderPanel(baseEmployee({ effectiveState: "ABSENT" }));
    assert.match(absentView.container.textContent ?? "", /Ausente/);
    absentView.unmount();

    const presentView = renderPanel(baseEmployee({ effectiveState: "PRESENT" }));
    assert.match(presentView.container.textContent ?? "", /Con asistencia/);
  });

  it("renders attendance conflict warning", () => {
    const view = renderPanel(
      baseEmployee({
        effectiveState: "PRESENT",
        hasAttendanceConflict: true,
        absenceContext: {
          absenceRequestId: "absence-1",
          absenceTypeName: "Vacaciones",
          absenceStartDate: "2026-08-01",
          absenceEndDate: "2026-08-14",
          hasAttendanceConflict: true,
        },
      }),
    );

    assert.match(
      view.container.textContent ?? "",
      /Existe una asistencia registrada para esta jornada/,
    );
    assert.match(view.container.textContent ?? "", /no modificó automáticamente el registro/);
  });
});
