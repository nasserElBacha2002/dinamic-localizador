import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import type { OperationEmployeeAssignment } from "../../types/operation";
import { EndAssignmentDialog } from "./EndAssignmentDialog";
import { submitEndAssignmentForm } from "./end-assignment-form";
import { OperationAssignmentList } from "./OperationAssignmentList";
import {
  assignmentActionLabel,
  displayStateLabels,
  mapAssignmentErrorMessage,
  resolveAssignmentAction,
  resolveAssignmentDisplayState,
} from "./operation-assignment-display";

function buildAssignment(
  overrides: Partial<OperationEmployeeAssignment> = {},
): OperationEmployeeAssignment {
  return {
    id: overrides.id ?? "assignment-1",
    operationId: "operation-1",
    employeeId: "employee-1",
    validFrom: "2026-07-10",
    validUntil: "2026-07-10",
    confirmationStatus: "PENDING",
    confirmedAt: null,
    unavailableAt: null,
    lifecycleState: "CURRENT",
    cancelledAt: null,
    employee: {
      id: "employee-1",
      name: "Juan Pérez",
      documentNumber: null,
      phoneNumber: "+5491100000000",
      employeeType: "fijo",
      active: true,
      lastWorkedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderList(
  assignments: OperationEmployeeAssignment[],
  handlers: {
    onCancel?: (assignment: OperationEmployeeAssignment) => void;
    onEnd?: (assignment: OperationEmployeeAssignment) => void;
  } = {},
) {
  return render(
    <MantineProvider>
      <OperationAssignmentList
        assignments={assignments}
        operationWorkDate="2026-07-10"
        canAssign
        onCancel={handlers.onCancel ?? (() => {})}
        onEnd={handlers.onEnd ?? (() => {})}
      />
    </MantineProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("operation assignment display helpers", () => {
  it("maps lifecycle and cancelled display states", () => {
    assert.equal(resolveAssignmentDisplayState(buildAssignment({ lifecycleState: "CURRENT" })), "CURRENT");
    assert.equal(resolveAssignmentDisplayState(buildAssignment({ lifecycleState: "FUTURE" })), "FUTURE");
    assert.equal(resolveAssignmentDisplayState(buildAssignment({ lifecycleState: "ENDED" })), "ENDED");
    assert.equal(
      resolveAssignmentDisplayState(
        buildAssignment({ lifecycleState: undefined, cancelledAt: "2026-07-10T12:00:00.000Z" }),
      ),
      "CANCELLED",
    );
    assert.equal(displayStateLabels.CANCELLED, "Cancelada");
  });

  it("maps assignment error codes to Spanish messages", () => {
    assert.match(
      mapAssignmentErrorMessage("ASSIGNMENT_PERIOD_OVERLAP", "fallback"),
      /asignación en el período/,
    );
    assert.match(
      mapAssignmentErrorMessage("ASSIGNMENT_HAS_ATTENDANCE_RECORDS", "fallback"),
      /registros de asistencia/,
    );
  });
});

describe("OperationAssignmentList", () => {
  it("renders lifecycle badges in Spanish", () => {
    const view = renderList([
      buildAssignment({ id: "a1", lifecycleState: "CURRENT" }),
      buildAssignment({ id: "a2", lifecycleState: "FUTURE", validFrom: "2026-08-01", validUntil: null }),
      buildAssignment({ id: "a3", lifecycleState: "ENDED", validUntil: "2026-06-30" }),
      buildAssignment({
        id: "a4",
        cancelledAt: "2026-07-09T10:00:00.000Z",
        lifecycleState: undefined,
      }),
    ]);

    assert.ok(view.getByText("Actual"));
    assert.ok(view.getByText("Próxima"));
    assert.ok(view.getByText("Finalizada"));
    assert.ok(view.getByText("Cancelada"));
  });

  it("uses assignment id as row identity for repeated employees", () => {
    const cancelled = jestLikeCancel();
    const view = renderList(
      [
        buildAssignment({ id: "period-a", employeeId: "employee-1" }),
        buildAssignment({
          id: "period-b",
          employeeId: "employee-1",
          lifecycleState: "FUTURE",
          validFrom: "2026-08-01",
          validUntil: null,
        }),
      ],
      { onCancel: cancelled.fn },
    );

    fireEvent.click(view.getByText(assignmentActionLabel("cancel-current")));
    assert.equal(cancelled.calls.length, 1);
    assert.equal(cancelled.calls[0]?.id, "period-a");
  });

  it("shows Quitar asignación for current ONE_TIME assignment", () => {
    const view = renderList([buildAssignment()]);
    assert.ok(view.getByText("Quitar asignación"));
    assert.equal(view.queryByText("Finalizar asignación"), null);
  });

  it("shows Finalizar asignación for open-ended current assignment", () => {
    const view = renderList([
      buildAssignment({
        id: "open-ended",
        validFrom: "2026-07-01",
        validUntil: null,
      }),
    ]);
    assert.ok(view.getByText("Finalizar asignación"));
  });

  it("shows Cancelar asignación for future assignment", () => {
    const view = renderList([
      buildAssignment({
        id: "future",
        lifecycleState: "FUTURE",
        validFrom: "2026-08-01",
        validUntil: null,
      }),
    ]);
    assert.ok(view.getByText("Cancelar asignación"));
  });

  it("does not show actions for ended or cancelled assignments", () => {
    const view = renderList([
      buildAssignment({ id: "ended", lifecycleState: "ENDED", validUntil: "2026-06-01" }),
      buildAssignment({
        id: "cancelled",
        cancelledAt: "2026-07-09T10:00:00.000Z",
        lifecycleState: undefined,
      }),
    ]);

    assert.equal(view.queryByText("Quitar asignación"), null);
    assert.equal(view.queryByText("Finalizar asignación"), null);
    assert.equal(view.queryByText("Cancelar asignación"), null);
  });
});

describe("end assignment form", () => {
  it("submits effective date through form helper", async () => {
    let submittedDate: string | null = null;
    const result = await submitEndAssignmentForm("2026-07-20", async (effectiveDate) => {
      submittedDate = effectiveDate;
    });

    assert.equal(result.ok, true);
    assert.equal(submittedDate, "2026-07-20");
  });

  it("rejects missing effective date", async () => {
    const result = await submitEndAssignmentForm("", async () => {});
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /obligatoria/i);
    }
  });
});

describe("EndAssignmentDialog", () => {
  it("renders finalizar asignación dialog content", async () => {
    const view = render(
      <MantineProvider>
        <EndAssignmentDialog
          open
          employeeName="Juan Pérez"
          onClose={() => {}}
          onConfirm={async () => {}}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      assert.ok(view.getByText(/Juan Pérez dejará de estar asignado/i));
      assert.ok(document.getElementById("end-assignment-effective-date"));
      assert.ok(view.getByRole("button", { name: "Finalizar asignación" }));
    });
  });
});

function jestLikeCancel() {
  const calls: OperationEmployeeAssignment[] = [];
  return {
    calls,
    fn: (assignment: OperationEmployeeAssignment) => {
      calls.push(assignment);
    },
  };
}

describe("resolveAssignmentAction", () => {
  it("resolves cancel vs end actions by assignment context", () => {
    assert.equal(
      resolveAssignmentAction(buildAssignment(), "2026-07-10"),
      "cancel-current",
    );
    assert.equal(
      resolveAssignmentAction(
        buildAssignment({ validFrom: "2026-07-01", validUntil: null }),
        "2026-07-10",
      ),
      "end",
    );
    assert.equal(
      resolveAssignmentAction(
        buildAssignment({ lifecycleState: "FUTURE", validFrom: "2026-08-01", validUntil: null }),
        "2026-07-10",
      ),
      "cancel-future",
    );
  });
});
