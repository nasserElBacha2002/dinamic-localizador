import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { OperationAttendanceSummaryEmployee } from "../../types/operation-attendance-summary";
import { OperationEmployeeTable } from "./OperationEmployeeTable";
import { canReviewOperationalAttendance } from "./operation-workforce-attendance";

function buildRow(
  id: string,
  confirmationStatus: OperationAttendanceSummaryEmployee["confirmationStatus"],
  operationalStatus: OperationAttendanceSummaryEmployee["operationalStatus"],
  attendanceId: string | null,
): OperationAttendanceSummaryEmployee {
  return {
    assignmentId: `assignment-${id}`,
    employee: {
      id,
      name: `Employee ${id}`,
      documentNumber: null,
      phoneNumber: "+5491100000000",
      employeeType: "fijo",
      active: true,
      lastWorkedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    attendance: attendanceId
      ? {
          id: attendanceId,
          operationId: "operation-1",
          employeeId: id,
          receivedLatitude: -34.6,
          receivedLongitude: -58.4,
          distanceMeters: 10,
          validationStatus: operationalStatus === "VALID" ? "VALID" : "PENDING_REVIEW",
          locationStatus: "INSIDE_GEOFENCE",
          punctualityStatus: "ON_TIME",
          sourceMessageSid: null,
          validationReason: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          receivedAt: "2026-01-01T00:00:00.000Z",
          checkoutAt: null,
          checkoutLatitude: null,
          checkoutLongitude: null,
          checkoutDistanceMeters: null,
          checkoutStatus: null,
          checkoutReviewReason: null,
          earlyDepartureMinutes: null,
          extraWorkedMinutes: null,
          checkoutMessageSid: null,
          isSimulation: false,
          simulationSessionId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        }
      : null,
    operationalStatus,
    confirmationStatus,
    confirmedAt: confirmationStatus === "CONFIRMED" ? "2026-01-01T00:00:00.000Z" : null,
    unavailableAt: confirmationStatus === "UNAVAILABLE" ? "2026-01-01T00:00:00.000Z" : null,
  };
}

function renderTable(rows: OperationAttendanceSummaryEmployee[], onReviewApprove = () => {}) {
  return render(
    <MemoryRouter initialEntries={["/operations/operation-1"]}>
      <Routes>
        <Route
          path="/operations/:id"
          element={
            <MantineProvider>
              <OperationEmployeeTable
                operationId="operation-1"
                rows={rows}
                canAssign={false}
                canReviewAttendance={canReviewOperationalAttendance}
                onReviewApprove={onReviewApprove}
                onReviewReject={() => {}}
                onCancelAssignment={() => {}}
                onEndAssignment={() => {}}
                emptyTitle="Sin filas"
                emptyDescription="Sin datos"
              />
            </MantineProvider>
          }
        />
        <Route path="/attendance/:attendanceId" element={<span>Attendance detail</span>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

describe("OperationEmployeeTable", () => {
  it("renders confirmation and attendance labels without removed operational columns", () => {
    const rows = [
      buildRow("a", "PENDING", "NO_CHECK_IN", null),
      buildRow("b", "CONFIRMED", "VALID", "att-b"),
      buildRow("c", "UNAVAILABLE", "PENDING_REVIEW", "att-c"),
    ];

    const view = renderTable(rows);

    assert.ok(view.getByText("Pendiente"));
    assert.ok(view.getByText("Confirmado"));
    assert.ok(view.getByText("No disponible"));
    assert.ok(view.getByText("Sin registro"));
    assert.ok(view.getByText("Validado"));
    assert.ok(view.getByText("A revisar"));

    const headers = Array.from(view.container.querySelectorAll("th")).map((cell) => cell.textContent);
    assert.equal(headers.includes("Distancia"), false);
    assert.equal(headers.includes("Ubicación"), false);
    assert.equal(headers.includes("Estado operativo"), false);
    assert.equal(headers.includes("Estado salida"), false);
    assert.equal(headers.includes("Tiempo extra"), false);
    assert.equal(headers.includes("Teléfono"), false);
    assert.equal(headers.includes("Hora esperada"), false);
    assert.equal(headers.includes("Tipo"), false);
  });

  it("navigates to attendance detail only when the row has attendance", () => {
    const rows = [
      buildRow("a", "PENDING", "NO_CHECK_IN", null),
      buildRow("b", "CONFIRMED", "VALID", "att-b"),
    ];

    const view = renderTable(rows);

    fireEvent.click(view.getByText("Employee a").closest("tr")!);
    assert.equal(view.queryByText("Attendance detail"), null);

    fireEvent.click(view.getByText("Employee b").closest("tr")!);
    assert.ok(view.getByText("Attendance detail"));
  });

  it("uses contextual actions menu for attendance review", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const source = await readFile(
      join(process.cwd(), "src/components/operations/OperationEmployeeTable.tsx"),
      "utf8",
    );

    assert.match(source, /Aprobar asistencia/);
    assert.match(source, /<Menu/);
  });
});
