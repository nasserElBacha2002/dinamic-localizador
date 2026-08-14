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
import { OperationInlineAiSuggestion } from "./OperationInlineAiSuggestion";

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
      score: 0.82,
      rank: 1,
      reasons: [
        {
          code: "TEAM_AFFINITY",
          params: { matchedTeamMembers: 2, sharedOccurrences: 14 },
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
      reasons: [{ code: "LOCATION_PROXIMITY", params: { bucket: "CLOSE" } }],
    },
  ],
};

function renderInline(options: {
  excludeEmployeeIds?: string[];
  enabled?: boolean;
  onAssign?: (input: { employeeIds: string[] }) => Promise<{
    status: "success" | "partial" | "error";
    added: string[];
    skipped: Array<{ employeeId: string; reason: string }>;
  }>;
  onSeeMore?: () => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onAssign =
    options.onAssign ??
    (async () => ({ status: "success" as const, added: ["emp-b"], skipped: [] }));
  let seeMore = 0;
  return {
    onAssign,
    getSeeMoreCount: () => seeMore,
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
            <OperationInlineAiSuggestion
              operationId="op-1"
              operationKind="ONE_TIME"
              excludeEmployeeIds={options.excludeEmployeeIds ?? ["emp-a"]}
              enabled={options.enabled ?? true}
              onAssign={onAssign}
              onSeeMore={() => {
                seeMore += 1;
                options.onSeeMore?.();
              }}
            />
          </MantineProvider>
        </CompanyContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

describe("OperationInlineAiSuggestion", () => {
  const originalGet = scopedApiClient.get;
  let getCalls = 0;

  beforeEach(() => {
    setRuntimeCompanyId("company-1");
    getCalls = 0;
    scopedApiClient.get = (async () => {
      getCalls += 1;
      return {
        data: { data: sampleResponse },
        status: 200,
        statusText: "OK",
        headers: {},
        config: {},
      } as never;
    }) as typeof scopedApiClient.get;
  });

  afterEach(() => {
    scopedApiClient.get = originalGet;
    clearActiveCompanyId();
    cleanup();
  });

  it("shows suggestion automatically when enabled", async () => {
    const view = renderInline();
    await waitFor(() => assert.ok(view.getByText("Juan Pérez")));
    assert.ok(view.getByText("82% de afinidad"));
    assert.ok(view.getByText(/Trabajó 14 veces/i));
    assert.ok(getCalls >= 1);
  });

  it("does not fetch when disabled", async () => {
    renderInline({ enabled: false });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(getCalls, 0);
  });

  it("assigns via existing mutation callback", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let calls = 0;
    const view = renderInline({
      onAssign: async () => {
        calls += 1;
        return { status: "success", added: ["emp-b"], skipped: [] };
      },
    });
    await waitFor(() => view.getByText("Juan Pérez"));
    await user.click(view.getByRole("button", { name: /Agregar a Juan Pérez/i }));
    await waitFor(() => assert.equal(calls, 1));
  });

  it("hides when there are no recommendations left", async () => {
    scopedApiClient.get = (async () => {
      getCalls += 1;
      return {
        data: {
          data: { ...sampleResponse, recommendations: [] },
        },
      } as never;
    }) as typeof scopedApiClient.get;
    const view = renderInline();
    await waitFor(() => assert.ok(getCalls >= 1));
    assert.equal(view.queryByText(/Sugerencia de IA/i), null);
    assert.equal(view.queryByText("Juan Pérez"), null);
  });

  it("keeps retry on error without blocking", async () => {
    scopedApiClient.get = (async () => {
      throw new ApiError("falló la IA", "SERVER_ERROR", 500);
    }) as typeof scopedApiClient.get;
    const view = renderInline();
    await waitFor(() => assert.ok(view.getByText(/seguir asignando/i)));
    assert.ok(view.getByRole("button", { name: /Reintentar/i }));
  });

  it("Ver más recomendaciones triggers callback", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderInline();
    await waitFor(() => view.getByText("Juan Pérez"));
    await user.click(view.getByRole("button", { name: /Ver más recomendaciones/i }));
    assert.equal(view.getSeeMoreCount(), 1);
  });
});
