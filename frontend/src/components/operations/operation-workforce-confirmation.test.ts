import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assignmentConfirmationStatusLabels,
  assignmentConfirmationStatusTableLabels,
  operationalAttendanceStatusTableLabels,
} from "../../utils/labels";
import { assignmentConfirmationStatusTone } from "../../utils/attendance-status-tones";

describe("assignment confirmation labels", () => {
  it("maps confirmation statuses to Spanish labels", () => {
    assert.equal(assignmentConfirmationStatusLabels.CONFIRMED, "Confirmado");
    assert.equal(assignmentConfirmationStatusLabels.PENDING, "Pendiente de respuesta");
    assert.equal(assignmentConfirmationStatusLabels.UNAVAILABLE, "No disponible");
  });

  it("uses compact table labels for confirmation", () => {
    assert.equal(assignmentConfirmationStatusTableLabels.PENDING, "Pendiente");
    assert.equal(assignmentConfirmationStatusTableLabels.CONFIRMED, "Confirmado");
  });

  it("maps confirmation statuses to semantic badge tones", () => {
    assert.equal(assignmentConfirmationStatusTone("CONFIRMED"), "success");
    assert.equal(assignmentConfirmationStatusTone("PENDING"), "warning");
    assert.equal(assignmentConfirmationStatusTone("UNAVAILABLE"), "danger");
  });
});

describe("operational attendance status labels", () => {
  it("keeps confirmation separate from attendance validation labels", () => {
    assert.equal(operationalAttendanceStatusTableLabels.NO_CHECK_IN, "Sin registro");
    assert.equal(operationalAttendanceStatusTableLabels.VALID, "Validado");
    assert.equal(operationalAttendanceStatusTableLabels.PENDING_REVIEW, "A revisar");
    assert.equal(operationalAttendanceStatusTableLabels.REJECTED, "Rechazado");
  });
});

describe("Operation operational employee table UI", () => {
  it("renders grouped summary wiring and simplified production table navigation", async () => {
    const sectionSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationWorkforceSection.tsx"),
      "utf8",
    );
    const tableSource = await readFile(
      join(process.cwd(), "src/components/operations/OperationEmployeeTable.tsx"),
      "utf8",
    );

    assert.match(sectionSource, /OperationalSummaryMetrics/);
    assert.match(sectionSource, /OperationEmployeeTable/);
    assert.match(tableSource, /Confirmación/);
    assert.match(tableSource, /Estado asistencia/);
    assert.match(tableSource, /assignmentConfirmationStatusTableLabels/);
    assert.match(tableSource, /operationalAttendanceStatusTableLabels/);
    assert.match(tableSource, /isRowClickable/);
    assert.match(tableSource, /navigateWithListContext/);
    assert.doesNotMatch(tableSource, /header: "Distancia"/);
    assert.doesNotMatch(tableSource, /header: "Ubicación"/);
    assert.doesNotMatch(tableSource, /header: "Estado operativo"/);
    assert.doesNotMatch(tableSource, /header: "Teléfono"/);
    assert.doesNotMatch(tableSource, /header: "Tiempo extra"/);
    assert.doesNotMatch(tableSource, /header: "Estado salida"/);
  });
});
