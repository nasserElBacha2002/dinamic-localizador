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
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter } from "react-router";
import { clearActiveCompanyId, setRuntimeCompanyId } from "../../api/company-path";
import { scopedApiClient } from "../../api/scoped-client";
import { CompanyContext } from "../../context/company-context";
import type { CompanyMembershipSummary } from "../../types/company";
import {
  DEFAULT_LOOKUP_LIMIT,
  LOOKUP_STALE_TIME_MS,
  lookupKeys,
} from "../../queryKeys/lookups";
import { ServiceSearchAutocomplete } from "./ServiceSearchAutocomplete";

const activeCompany = {
  companyId: "company-a",
  companyName: "Company A",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
} satisfies CompanyMembershipSummary;

type GetCall = { path: string; params?: Record<string, unknown> };

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, staleTime: LOOKUP_STALE_TIME_MS },
      mutations: { retry: false },
    },
  });
}

function renderAutocomplete(value: string | null, queryClient = createTestQueryClient()) {
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
          <MemoryRouter>
            <ServiceSearchAutocomplete
              value={value}
              onChange={() => undefined}
              allowCreate={false}
            />
          </MemoryRouter>
        </MantineProvider>
      </CompanyContext.Provider>
    </QueryClientProvider>,
  );
}

describe("ServiceSearchAutocomplete cache unification", () => {
  const originalGet = scopedApiClient.get;
  let getCalls: GetCall[] = [];

  beforeEach(() => {
    getCalls = [];
    setRuntimeCompanyId(activeCompany.companyId);
    scopedApiClient.get = (async (path, config) => {
      const params = (config?.params ?? {}) as Record<string, unknown>;
      getCalls.push({ path: String(path), params });

      if (String(path).includes("lookups/services") && params.id) {
        return {
          data: {
            data: [{ id: String(params.id), name: `Selected ${params.id}`, address: "Calle 1" }],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {},
        } as never;
      }

      if (String(path).includes("lookups/services")) {
        return {
          data: {
            data: [
              { id: "svc-1", name: "Servicio Uno", address: "Dir 1" },
              { id: "svc-2", name: "Servicio Dos", address: "Dir 2" },
            ],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: {},
        } as never;
      }

      throw new Error(`Unexpected GET ${path}`);
    }) as typeof scopedApiClient.get;
  });

  afterEach(() => {
    scopedApiClient.get = originalGet;
    cleanup();
    clearActiveCompanyId();
  });

  it("resolves selected service via lookups-by-id only (no CRUD services/:id)", async () => {
    renderAutocomplete("svc-existing");

    await waitFor(() => {
      assert.ok(
        getCalls.some(
          (call) =>
            call.path.includes("lookups/services") && call.params.id === "svc-existing",
        ),
      );
    });

    const selectedCalls = getCalls.filter(
      (call) => call.path.includes("lookups/services") && call.params.id === "svc-existing",
    );
    assert.equal(selectedCalls.length, 1);
    assert.equal(selectedCalls[0]?.params.limit, 1);

    const crudDetailCalls = getCalls.filter(
      (call) => /services\/svc-existing/.test(call.path) && !call.path.includes("lookups"),
    );
    assert.equal(crudDetailCalls.length, 0);
  });

  it("uses DEFAULT_LOOKUP_LIMIT for service search keys", () => {
    const key = lookupKeys.serviceSearch(activeCompany.companyId, {
      search: "cafe",
      activeOnly: true,
      limit: DEFAULT_LOOKUP_LIMIT,
    });
    assert.equal(key[key.length - 1]?.limit, DEFAULT_LOOKUP_LIMIT);
    assert.notDeepEqual(
      lookupKeys.serviceSelected(activeCompany.companyId, "svc-1"),
      lookupKeys.serviceSearch(activeCompany.companyId, {
        search: "svc-1",
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
    );
  });
});
