/**
 * Admin zone dialog Phase B: coverage, badges, friendly errors, retry / manual confirm.
 * mock.module must run before the component module graph loads real hooks.
 */
import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";
import type { LocationZone } from "../../../types/location-zone";

const zones: LocationZone[] = [
  {
    id: "z-resolved",
    companyId: "c1",
    name: "Caballito",
    normalizedName: "caballito",
    locality: "CABA",
    normalizedLocality: "caba",
    centroidLatitude: -34.62,
    centroidLongitude: -58.44,
    geocodingStatus: "RESOLVED",
    geocodingSource: "AUTO",
    geocodedAt: "2026-08-01T00:00:00.000Z",
    geocodingLastError: null,
    isActive: true,
    assignedEmployeesCount: 2,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "z-manual",
    companyId: "c1",
    name: "Boedo",
    normalizedName: "boedo",
    locality: "CABA",
    normalizedLocality: "caba",
    centroidLatitude: -34.63,
    centroidLongitude: -58.41,
    geocodingStatus: "MANUAL",
    geocodingSource: "MANUAL",
    geocodedAt: null,
    geocodingLastError: null,
    isActive: true,
    assignedEmployeesCount: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "z-pending",
    companyId: "c1",
    name: "Merlo",
    normalizedName: "merlo",
    locality: "GBA",
    normalizedLocality: "gba",
    centroidLatitude: null,
    centroidLongitude: null,
    geocodingStatus: "PENDING",
    geocodingSource: null,
    geocodedAt: null,
    geocodingLastError: null,
    isActive: true,
    assignedEmployeesCount: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "z-failed",
    companyId: "c1",
    name: "Centro",
    normalizedName: "centro",
    locality: "Salta",
    normalizedLocality: "salta",
    centroidLatitude: null,
    centroidLongitude: null,
    geocodingStatus: "FAILED",
    geocodingSource: "AUTO",
    geocodedAt: null,
    geocodingLastError: "ZERO_RESULTS",
    isActive: true,
    assignedEmployeesCount: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

mock.module("../../../hooks/useLocationZones", {
  namedExports: {
    useCreateLocationZone: () => ({
      mutateAsync: async () => undefined,
      isPending: false,
    }),
    useUpdateLocationZone: () => ({
      mutateAsync: async () => undefined,
      isPending: false,
    }),
    useGeocodeLocationZone: () => ({
      mutateAsync: async () => undefined,
      isPending: false,
      variables: undefined,
    }),
    useLocationZonesGeocodingSummary: () => ({
      data: {
        total: 4,
        resolved: 1,
        manual: 1,
        pending: 1,
        failed: 1,
        withCoordinates: 2,
        withoutCoordinates: 2,
        coveragePercent: 50,
        canonicalized: 4,
        missingLocality: 0,
        unknownLocality: 0,
      },
      isLoading: false,
      isError: false,
    }),
  },
});

import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";

let LocationZonesDialogContent: typeof import("./LocationZonesDialogContent").LocationZonesDialogContent;

before(async () => {
  ({ LocationZonesDialogContent } = await import("./LocationZonesDialogContent"));
});

beforeEach(() => {
  setupDomEnvironment();
});

afterEach(() => {
  cleanup();
});

describe("LocationZonesDialogContent Phase B", () => {
  it("shows coverage summary, status badges, friendly FAILED error and Reintentar", () => {
    const view = render(
      <MantineProvider>
        <LocationZonesDialogContent zones={zones} canUpdate />
      </MantineProvider>,
    );

    assert.ok(view.getByText(/cobertura geográfica/i));
    assert.ok(view.getByText(/2 de 4 zonas activas con coordenadas/i));
    assert.ok(view.getByText(/resueltas automáticamente:\s*1/i));
    assert.ok(view.getByText(/manuales:\s*1/i));
    assert.ok(view.getByText(/pendientes:\s*1/i));
    assert.ok(view.getByText(/con error:\s*1/i));
    assert.ok(view.getByText(/localidades canónicas:\s*4/i));
    assert.ok(view.getByText("No se encontró una ubicación compatible."));
    assert.ok(view.getByRole("button", { name: "Reintentar" }));

    const table = view.getByRole("table");
    assert.ok(within(table).getByText("Resuelta"));
    assert.ok(within(table).getByText("Manual"));
    assert.ok(within(table).getByText("Pendiente"));
    assert.ok(within(table).getByText("Error"));
    assert.ok(within(table).getByText("Coordenadas manuales"));

    const confirmCalls: string[] = [];
    const originalConfirm = window.confirm;
    window.confirm = (message?: string) => {
      confirmCalls.push(String(message ?? ""));
      return false;
    };
    try {
      const manualRow = within(table).getByText("Boedo").closest("tr");
      assert.ok(manualRow);
      fireEvent.click(within(manualRow).getByRole("button", { name: "Recalcular" }));
      assert.equal(confirmCalls.length, 1);
      assert.match(confirmCalls[0]!, /coordenadas manuales/i);
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
