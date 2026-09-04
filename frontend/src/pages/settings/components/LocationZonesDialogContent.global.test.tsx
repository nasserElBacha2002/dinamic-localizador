/**
 * Behavioral tests for global location zone search/add UX.
 */
import { setupDomEnvironment } from "../../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { mock } from "node:test";
import type { LocationZone } from "../../../types/location-zone";

const companyZones: LocationZone[] = [
  {
    id: "z-caballito",
    companyId: "c1",
    associationId: "a1",
    associationActive: true,
    globalIsActive: true,
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
    assignedEmployeesCount: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
];

let searchData: LocationZone[] = [];
let searchFetching = false;
let searchError: Error | null = null;
let createShouldFail = false;
let createCalls = 0;
let lastCreateInput: unknown = null;

mock.module("../../../hooks/useLocationZones", {
  namedExports: {
    useCreateLocationZone: () => ({
      mutateAsync: async (input: unknown) => {
        createCalls += 1;
        lastCreateInput = input;
        if (createShouldFail) {
          throw new Error("create failed");
        }
        return undefined;
      },
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
    useSearchLocationZones: () => ({
      data: searchData,
      isFetching: searchFetching,
      isError: Boolean(searchError),
      error: searchError,
    }),
    useLocationZonesGeocodingSummary: () => ({
      data: {
        total: 1,
        resolved: 1,
        manual: 0,
        pending: 0,
        failed: 0,
        withCoordinates: 1,
        withoutCoordinates: 0,
        coveragePercent: 100,
        canonicalized: 1,
        missingLocality: 0,
        unknownLocality: 0,
      },
      isLoading: false,
      isError: false,
    }),
  },
});

import { MantineProvider } from "@mantine/core";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";

let LocationZonesDialogContent: typeof import("./LocationZonesDialogContent").LocationZonesDialogContent;

before(async () => {
  ({ LocationZonesDialogContent } = await import("./LocationZonesDialogContent"));
});

beforeEach(() => {
  setupDomEnvironment();
  searchData = [];
  searchFetching = false;
  searchError = null;
  createShouldFail = false;
  createCalls = 0;
  lastCreateInput = null;
});

afterEach(() => {
  cleanup();
});

describe("LocationZonesDialogContent global search UX", () => {
  it("shows global hits with Agregar / Agregada and no fixed Barrio label", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    searchData = [
      {
        ...companyZones[0]!,
        id: "z-other",
        name: "Palermo",
        normalizedName: "palermo",
        alreadyAssociated: false,
        associationId: "",
        associationActive: false,
      },
      {
        ...companyZones[0]!,
        alreadyAssociated: true,
      },
    ];

    const view = render(
      <MantineProvider>
        <LocationZonesDialogContent zones={companyZones} canUpdate />
      </MantineProvider>,
    );

    await user.type(view.getByLabelText("Nombre"), "Pa");

    await waitFor(
      () => {
        assert.ok(view.getByText("Palermo"));
        assert.ok(view.getAllByText("Caballito").length >= 1);
        assert.ok(view.getByRole("button", { name: "Agregar" }));
        assert.ok(view.getByText("Agregada"));
      },
      { timeout: 3000 },
    );

    assert.equal(view.queryByText(/· Barrio/), null);
  });

  it("keeps inputs after create error", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    createShouldFail = true;
    const view = render(
      <MantineProvider>
        <LocationZonesDialogContent zones={companyZones} canUpdate />
      </MantineProvider>,
    );

    const nameInput = view.getByLabelText("Crear nueva");
    await user.type(nameInput, "Nueva Zona");
    await user.click(view.getByRole("button", { name: /Crear y agregar/i }));

    await waitFor(() => {
      assert.equal(createCalls, 1);
      assert.equal((nameInput as HTMLInputElement).value, "Nueva Zona");
    });
  });

  it("clears create inputs only after success", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = render(
      <MantineProvider>
        <LocationZonesDialogContent zones={companyZones} canUpdate />
      </MantineProvider>,
    );

    const nameInput = view.getByLabelText("Crear nueva");
    await user.type(nameInput, "Nueva Zona");
    await user.click(view.getByRole("button", { name: /Crear y agregar/i }));

    await waitFor(() => {
      assert.equal(createCalls, 1);
      assert.deepEqual(lastCreateInput, { name: "Nueva Zona", locality: null });
      assert.equal((nameInput as HTMLInputElement).value, "");
    });
  });

  it("hides global edit controls for company admin", () => {
    const view = render(
      <MantineProvider>
        <LocationZonesDialogContent zones={companyZones} canUpdate canEditGlobal={false} />
      </MantineProvider>,
    );
    const table = view.getByRole("table");
    assert.equal(within(table).queryByRole("button", { name: "Editar" }), null);
    assert.equal(within(table).queryByRole("button", { name: "Recalcular" }), null);
  });

  it("shows global edit controls for platform admin", () => {
    const view = render(
      <MantineProvider>
        <LocationZonesDialogContent zones={companyZones} canUpdate canEditGlobal />
      </MantineProvider>,
    );
    const table = view.getByRole("table");
    assert.ok(within(table).getByRole("button", { name: "Editar" }));
    assert.ok(within(table).getByRole("button", { name: "Recalcular" }));
  });
});
