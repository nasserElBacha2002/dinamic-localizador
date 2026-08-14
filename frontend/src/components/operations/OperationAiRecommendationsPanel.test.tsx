import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { clearActiveCompanyId, setRuntimeCompanyId } from "../../api/company-path";
import { scopedApiClient } from "../../api/scoped-client";
import { CompanyContext } from "../../context/company-context";
import type { CompanyMembershipSummary } from "../../types/company";
import type { IndividualEmployeeRecommendationResponse } from "../../types/recommendation";
import { ApiError } from "../../utils/errors";
import { OperationAiRecommendationsPanel } from "./OperationAiRecommendationsPanel";

const activeCompany = {
  companyId: "company-1",
  companyName: "Test Co",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
} satisfies CompanyMembershipSummary;

const sampleResponse: IndividualEmployeeRecommendationResponse = {
  operationId: "op-1",
  algorithmVersion: "workforce-recommendation-v1",
  generatedAt: "2026-08-14T12:00:00.000Z",
  candidateCount: 2,
  recommendations: [
    {
      employee: {
        id: "emp-b",
        name: "Juan Pérez",
        employeeType: "fijo",
        categoryId: null,
        categoryName: null,
      },
      score: 0.87,
      rank: 1,
      reasons: [
        {
          code: "TEAM_AFFINITY",
          params: { matchedTeamMembers: 2, sharedOccurrences: 8 },
        },
        {
          code: "SERVICE_EXPERIENCE",
          params: { serviceWorkdays: 5 },
        },
        {
          code: "LOCATION_PROXIMITY",
          params: { bucket: "CLOSE" },
        },
      ],
    },
    {
      employee: {
        id: "emp-c",
        name: "Ana López",
        employeeType: "eventual",
        categoryId: null,
        categoryName: null,
      },
      score: 0.55,
      rank: 2,
      reasons: [{ code: "LOCATION_PROXIMITY", params: { bucket: "MEDIUM" } }],
    },
  ],
};

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPanel(options: {
  onAssign?: (input: {
    employeeIds: string[];
    validFrom?: string;
    validUntil?: string | null;
  }) => Promise<{ status: "success" | "partial" | "error"; added: string[]; skipped: [] }>;
  excludeEmployeeIds?: string[];
  enabled?: boolean;
} = {}) {
  const queryClient = createClient();
  const onAssign =
    options.onAssign ??
    (async () => ({ status: "success" as const, added: ["emp-b"], skipped: [] }));

  return {
    onAssign,
    ...render(
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
            <OperationAiRecommendationsPanel
              operationId="op-1"
              operationKind="ONE_TIME"
              operationWorkDate="2026-08-20"
              excludeEmployeeIds={options.excludeEmployeeIds ?? []}
              enabled={options.enabled ?? true}
              onAssign={onAssign}
            />
          </MantineProvider>
        </CompanyContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

describe("OperationAiRecommendationsPanel", () => {
  const originalGet = scopedApiClient.get;

  beforeEach(() => {
    setRuntimeCompanyId("company-1");
    scopedApiClient.get = (async () =>
      ({
        data: { data: sampleResponse },
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

  it("renders ranked recommendations with affinity and AI badge", async () => {
    const view = renderPanel();
    await waitFor(() => {
      assert.ok(view.getByText("Juan Pérez"));
    });
    assert.ok(view.getByText("87% de afinidad", { exact: false }));
    assert.ok(view.getAllByText("Recomendado por IA").length >= 1);
    assert.equal(view.queryByText("workforce-recommendation-v1"), null);
    assert.equal(view.queryByText(/probabilidad/i), null);
  });

  it("shows structured reasons without privacy fields", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await waitFor(() => {
      assert.ok(view.getByText("Juan Pérez"));
    });

    await user.click(view.getAllByText("¿Por qué la IA lo recomienda?")[0]!);
    await waitFor(() => {
      assert.ok(view.getAllByText(/Trabajó 8 veces con 2 integrantes/).length >= 1);
      assert.ok(view.getByText(/5 jornadas anteriores en esta sucursal/));
      assert.ok(view.getByText(/cerca de la operación/i));
    });
    assert.equal(view.queryByText(/Caballito|teléfono|documento|latitude/i), null);
  });

  it("assigns via the provided mutation callback", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let assigned: string[] = [];
    const view = renderPanel({
      onAssign: async ({ employeeIds }) => {
        assigned = employeeIds;
        return { status: "success", added: employeeIds, skipped: [] };
      },
    });
    await waitFor(() => {
      assert.ok(view.getByText("Juan Pérez"));
    });
    await user.click(view.getByRole("button", { name: "Asignar a Juan Pérez" }));
    await waitFor(() => {
      assert.deepEqual(assigned, ["emp-b"]);
    });
  });

  it("keeps manual flow usable when recommendations fail", async () => {
    scopedApiClient.get = (async () => {
      throw new ApiError(500, "SERVER_ERROR", "falló la IA");
    }) as typeof scopedApiClient.get;

    const view = renderPanel();
    await waitFor(() => {
      assert.ok(view.getByText(/No pudimos generar recomendaciones con IA/));
    });
    assert.ok(view.getByText(/Podés seguir asignando/));
    assert.ok(view.getByRole("button", { name: "Reintentar" }));
  });

  it("shows empty state when there are no candidates", async () => {
    scopedApiClient.get = (async () =>
      ({
        data: {
          data: {
            ...sampleResponse,
            candidateCount: 0,
            recommendations: [],
          },
        },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      }) as never);

    const view = renderPanel();
    await waitFor(() => {
      assert.ok(view.getByText(/No hay colaboradores disponibles para recomendar/i));
    });
  });

  it("does not fetch while disabled (lazy tab)", async () => {
    let calls = 0;
    scopedApiClient.get = (async () => {
      calls += 1;
      return {
        data: { data: sampleResponse },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      } as never;
    }) as typeof scopedApiClient.get;

    renderPanel({ enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(calls, 0);
  });
});
