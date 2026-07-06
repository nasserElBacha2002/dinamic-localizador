import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import {
  buildGoogleMapsSearchUrl,
  formatAssignmentAddress,
  formatTodayAssignmentBlock,
  formatUpcomingAssignmentBlock,
} from "./employee-assignment-format";

const baseAssignment = (
  overrides: Partial<EmployeeAssignedOperation> = {},
): EmployeeAssignedOperation => ({
  operationId: "inv-1",
  serviceName: "Carrefour Palermo",
  serviceAddress: "Av. Santa Fe 1234, Palermo",
  serviceLatitude: -34.6037,
  serviceLongitude: -58.3816,
  scheduledStart: "2026-07-08T23:30:00.000Z",
  scheduledEnd: "2026-07-09T06:00:00.000Z",
  operationStatus: "SCHEDULED",
  confirmationStatus: "PENDING",
  attendanceReceivedAt: null,
  attendanceCheckoutAt: null,
  punctualityStatus: null,
  ...overrides,
});

describe("employee assignment formatting", () => {
  it("includes address when present", () => {
    assert.equal(formatAssignmentAddress(baseAssignment()), "Av. Santa Fe 1234, Palermo");
  });

  it("handles missing address gracefully", () => {
    assert.equal(formatAssignmentAddress(baseAssignment({ serviceAddress: null })), "no disponible");
  });

  it("builds coordinate-based Google Maps link", () => {
    const url = buildGoogleMapsSearchUrl(baseAssignment());
    assert.equal(url, "https://www.google.com/maps/search/?api=1&query=-34.6037,-58.3816");
  });

  it("builds address-based Google Maps link when coordinates are missing", () => {
    const url = buildGoogleMapsSearchUrl(
      baseAssignment({ serviceLatitude: null, serviceLongitude: null }),
    );
    assert.match(url ?? "", /query=Av.%20Santa%20Fe%201234/);
  });

  it("includes address and map in today workday block", () => {
    const lines = formatTodayAssignmentBlock(
      baseAssignment(),
      1,
      "America/Argentina/Buenos_Aires",
      true,
    );
    const text = lines.join("\n");
    assert.match(text, /Carrefour Palermo/);
    assert.match(text, /Dirección: Av\. Santa Fe 1234, Palermo/);
    assert.match(text, /Mapa: https:\/\/www\.google\.com\/maps\/search/);
    assert.match(text, /Llegada: pendiente/);
  });

  it("includes address and map in upcoming assignment block", () => {
    const lines = formatUpcomingAssignmentBlock(
      baseAssignment(),
      1,
      "America/Argentina/Buenos_Aires",
    );
    const text = lines.join("\n");
    assert.match(text, /Fecha:/);
    assert.match(text, /Dirección:/);
    assert.match(text, /Mapa:/);
  });
});
