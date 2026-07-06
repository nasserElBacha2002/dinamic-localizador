import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assignmentConfirmationStatusLabels,
  assignmentConfirmationStatusTableLabels,
  operationalAttendanceStatusTableLabels,
} from "../utils/labels";
import { assignmentConfirmationStatusTone } from "../utils/attendance-status-tones";

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

describe("InventoryOperationalSection operational UI", () => {
  it("renders grouped summary, simplified columns, and contextual navigation", async () => {
    const source = await readFile(
      join(process.cwd(), "src/components/inventories/InventoryOperationalSection.tsx"),
      "utf8",
    );

    assert.match(source, /OperationalSummaryMetrics/);
    assert.match(source, /Confirmación/);
    assert.match(source, /Estado asistencia/);
    assert.match(source, /assignmentConfirmationStatusTableLabels/);
    assert.match(source, /operationalAttendanceStatusTableLabels/);
    assert.match(source, /isRowClickable/);
    assert.match(source, /navigateWithListContext/);
    assert.doesNotMatch(source, /header: "Distancia"/);
    assert.doesNotMatch(source, /header: "Ubicación"/);
    assert.doesNotMatch(source, /header: "Estado operativo"/);
    assert.doesNotMatch(source, /header: "Teléfono"/);
    assert.doesNotMatch(source, /header: "Tiempo extra"/);
    assert.doesNotMatch(source, /header: "Estado salida"/);
  });
});
