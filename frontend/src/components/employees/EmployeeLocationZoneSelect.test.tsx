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
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it } from "node:test";
import React, { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { scopedApiClient } from "../../api/scoped-client";
import { clearActiveCompanyId, setRuntimeCompanyId } from "../../api/company-path";
import { CompanyContext } from "../../context/company-context";
import type { CompanyMembershipSummary } from "../../types/company";
import type { LocationZone } from "../../types/location-zone";
import { ApiError } from "../../utils/errors";
import { EmployeeLocationZoneSelect } from "./EmployeeLocationZoneSelect";

const activeCompany = {
  companyId: "company-1",
  companyName: "Test Co",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
} satisfies CompanyMembershipSummary;

const caballito: LocationZone = {
  id: "zone-caballito",
  companyId: "company-1",
  name: "Caballito",
  normalizedName: "caballito",
  locality: "Ciudad Autónoma de Buenos Aires",
  normalizedLocality: "ciudad autonoma de buenos aires",
  centroidLatitude: null,
  centroidLongitude: null,
  geocodingStatus: null,
  geocodingSource: null,
  geocodedAt: null,
  geocodingLastError: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const flores: LocationZone = {
  id: "zone-flores",
  companyId: "company-1",
  name: "Flores",
  normalizedName: "flores",
  locality: null,
  normalizedLocality: "",
  centroidLatitude: null,
  centroidLongitude: null,
  geocodingStatus: null,
  geocodingSource: null,
  geocodedAt: null,
  geocodingLastError: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type FormValues = {
  locationZoneId: string | null;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function ZoneFormHarness({
  retainedZone = null,
  canCreate = false,
  defaultValues = { locationZoneId: null as string | null },
  onValuesChange,
}: {
  retainedZone?: { id: string; name: string; locality?: string | null } | null;
  canCreate?: boolean;
  defaultValues?: FormValues;
  onValuesChange?: (values: FormValues) => void;
}) {
  const form = useForm<FormValues>({ defaultValues });

  useEffect(() => {
    const subscription = form.watch((values) => {
      onValuesChange?.(values as FormValues);
    });
    return () => subscription.unsubscribe();
  }, [form, onValuesChange]);

  return (
    <FormProvider {...form}>
      <EmployeeLocationZoneSelect
        control={form.control}
        name="locationZoneId"
        canCreate={canCreate}
        retainedZone={retainedZone}
      />
    </FormProvider>
  );
}

function renderSelect(options: {
  retainedZone?: { id: string; name: string; locality?: string | null } | null;
  canCreate?: boolean;
  defaultValues?: FormValues;
  onValuesChange?: (values: FormValues) => void;
} = {}) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanyContext.Provider
        value={{
          companies: [activeCompany],
          activeCompany,
          isLoading: false,
          isReady: true,
          requiresSelection: false,
          hasNoCompanies: false,
          selectCompany: () => {},
          refreshCompanies: async () => {},
          clearActiveCompany: () => {},
        }}
      >
        <MantineProvider>
          <ZoneFormHarness {...options} />
        </MantineProvider>
      </CompanyContext.Provider>
    </QueryClientProvider>,
  );
}

describe("EmployeeLocationZoneSelect", () => {
  const originalGet = scopedApiClient.get;
  let latestValues: FormValues = { locationZoneId: null };

  beforeEach(() => {
    latestValues = { locationZoneId: null };
    setRuntimeCompanyId("company-1");
    scopedApiClient.get = (async () =>
      ({
        data: { data: [caballito, flores] },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      }) as never);
  });

  afterEach(() => {
    scopedApiClient.get = originalGet;
    clearActiveCompanyId();
    cleanup();
  });

  it("loads zones into the selector", async () => {
    const view = renderSelect();
    await waitFor(() => {
      assert.equal((view.getByLabelText("Zona de residencia") as HTMLInputElement).disabled, false);
    });
  });

  it("selects a zone from the catalog", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderSelect({
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Zona de residencia") as HTMLInputElement).disabled, false);
    });

    const input = view.getByLabelText("Zona de residencia");
    await user.click(input);
    await waitFor(() => {
      assert.ok(view.getByText(/Caballito/));
      assert.ok(view.getByText("Sin especificar"));
    });
    await user.click(view.getByText(/Caballito —/));

    await waitFor(() => {
      assert.equal(latestValues.locationZoneId, "zone-caballito");
    });
  });

  it("allows clearing selection via Sin especificar", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderSelect({
      defaultValues: { locationZoneId: "zone-caballito" },
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Zona de residencia") as HTMLInputElement).disabled, false);
    });

    const input = view.getByLabelText("Zona de residencia");
    await user.click(input);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    await waitFor(() => {
      assert.ok(view.getByText("Sin especificar"));
    });
    await user.click(view.getByText("Sin especificar"));

    await waitFor(() => {
      assert.equal(latestValues.locationZoneId, null);
    });
  });

  it("keeps retained inactive zone visible", async () => {
    const view = renderSelect({
      defaultValues: { locationZoneId: "zone-old" },
      retainedZone: { id: "zone-old", name: "Villa Urquiza", locality: null },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Zona de residencia") as HTMLInputElement).disabled, false);
    });

    fireEvent.focus(view.getByLabelText("Zona de residencia"));
    await waitFor(() => {
      assert.ok(view.getByText(/Villa Urquiza/));
    });
  });

  it("shows catalog API error", async () => {
    scopedApiClient.get = (async () => {
      throw new ApiError(500, "SERVER_ERROR", "falló el catálogo");
    }) as typeof scopedApiClient.get;

    const view = renderSelect();
    await waitFor(() => {
      assert.ok(view.getByText(/No se pudieron cargar las zonas/));
    });
  });

  it("creates a missing zone from the creatable input", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const originalPost = scopedApiClient.post;
    let postedBody: Record<string, unknown> | null = null;

    scopedApiClient.post = (async (_url: string, body: unknown) => {
      postedBody = body as Record<string, unknown>;
      return {
        data: {
          data: {
            id: "zone-new",
            companyId: "company-1",
            name: "Villa del Parque",
            normalizedName: "villa del parque",
            locality: "CABA",
            normalizedLocality: "caba",
            centroidLatitude: null,
            centroidLongitude: null,
            geocodingStatus: "PENDING",
            geocodingSource: null,
            geocodedAt: null,
            geocodingLastError: null,
            isActive: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        },
        status: 201,
        statusText: "Created",
        headers: {},
        config: {},
      } as never;
    }) as typeof scopedApiClient.post;

    const view = renderSelect({
      canCreate: true,
      onValuesChange: (values) => {
        latestValues = values;
      },
    });

    await waitFor(() => {
      assert.equal((view.getByLabelText("Zona de residencia") as HTMLInputElement).disabled, false);
    });

    const input = view.getByLabelText("Zona de residencia");
    await user.click(input);
    await user.type(input, "Villa del Parque");
    await waitFor(() => {
      assert.ok(view.getByText(/Crear “Villa del Parque”/));
    });
    await user.click(view.getByText(/Crear “Villa del Parque”/));

    const localityInput = view.getByLabelText("Localidad");
    await user.clear(localityInput);
    await user.type(localityInput, "CABA");
    await user.click(view.getByRole("button", { name: "Crear y seleccionar" }));

    await waitFor(() => {
      assert.equal(latestValues.locationZoneId, "zone-new");
      assert.equal(postedBody?.name, "Villa del Parque");
      assert.equal(postedBody?.locality, "CABA");
    });

    scopedApiClient.post = originalPost;
  });
});
