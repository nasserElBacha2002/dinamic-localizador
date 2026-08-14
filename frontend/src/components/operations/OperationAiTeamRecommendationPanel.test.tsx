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
import type {
  RecommendationEmployeeSummary,
  TeamRecommendationMember,
  TeamRecommendationResponse,
} from "../../types/recommendation";
import { ApiError } from "../../utils/errors";
import { OperationAiTeamRecommendationPanel } from "./OperationAiTeamRecommendationPanel";

const activeCompany = {
  companyId: "company-1",
  companyName: "Test Co",
  role: "ADMIN",
  isDefault: true,
  status: "ACTIVE",
} satisfies CompanyMembershipSummary;

function emp(id: string, name: string): RecommendationEmployeeSummary {
  return {
    id,
    name,
    employeeType: "fijo",
    categoryId: null,
    categoryName: null,
  };
}

function member(
  id: string,
  name: string,
  extras: Partial<TeamRecommendationMember> = {},
): TeamRecommendationMember {
  return {
    employee: emp(id, name),
    alreadyAssigned: false,
    locked: false,
    role: "SUGGESTED",
    ...extras,
  };
}

const names = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Facu"] as const;

const teamResponse = (
  overrides: Partial<TeamRecommendationResponse> = {},
): TeamRecommendationResponse => ({
  operationId: "op-1",
  serviceId: "svc-1",
  algorithmVersion: "workforce-team-recommendation-v1",
  generatedAt: "2026-08-14T12:00:00.000Z",
  requestedTeamSize: 6,
  existingMemberCount: 0,
  lockedMemberCount: 0,
  slotsToFill: 6,
  candidateCount: 10,
  pairCount: 5,
  recommendations: [
    {
      rank: 1,
      score: 0.88,
      complete: true,
      members: names.map((name, i) => member(`e${i + 1}`, name)),
      reasons: [
        {
          code: "TEAM_HISTORY_COVERAGE",
          params: { members: 6, membersWithConnections: 5 },
        },
      ],
    },
    {
      rank: 2,
      score: 0.7,
      complete: true,
      members: [
        member("e1", "Ana"),
        member("e2", "Bruno"),
        member("e3", "Carla"),
        member("e4", "Diego"),
        member("e5", "Elena"),
        member("e7", "Gina"),
      ],
      reasons: [
        {
          code: "TEAM_SERVICE_EXPERIENCE",
          params: { experiencedMembers: 4, teamSize: 6 },
        },
      ],
    },
  ],
  ...overrides,
});

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof OperationAiTeamRecommendationPanel>> = {},
) {
  const client = createClient();
  const onAssign =
    props.onAssign ??
    (async () => ({
      status: "success" as const,
      added: [],
      skipped: [],
    }));
  return {
    onAssign,
    ...render(
      <QueryClientProvider client={client}>
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
            <OperationAiTeamRecommendationPanel
              operationId="op-1"
              operationKind="ONE_TIME"
              operationWorkDate="2026-08-20"
              existingMemberCount={0}
              onAssign={onAssign}
              {...props}
            />
          </MantineProvider>
        </CompanyContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

describe("OperationAiTeamRecommendationPanel", () => {
  let postCalls: Array<{ url: string; body: unknown }> = [];
  const originalPost = scopedApiClient.post;

  beforeEach(() => {
    setRuntimeCompanyId("company-1");
    postCalls = [];
    scopedApiClient.post = (async (url: string, body?: unknown) => {
      postCalls.push({ url, body });
      return { data: { data: teamResponse() } };
    }) as typeof scopedApiClient.post;
  });

  afterEach(() => {
    scopedApiClient.post = originalPost;
    clearActiveCompanyId();
    cleanup();
  });

  it("generates a team and shows snapshot score/reasons", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => {
      assert.ok(view.getByText("88% de afinidad"));
      assert.ok(view.getByText("Ana"));
    });
    await user.click(view.getByText(/Por qué la IA recomienda este equipo/i));
    assert.ok(view.getByText(/5 de los 6 integrantes/i));
  });

  it("switches alternatives with matching score/members", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => view.getByText("Ana"));
    await user.click(view.getByRole("button", { name: /Ver alternativa 2/i }));
    assert.ok(view.getByText("Gina"));
    assert.ok(view.getByText("70% de afinidad"));
    assert.equal(view.queryByText("Facu"), null);
  });

  it("marks draft stale when removing a member and blocks use", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => view.getByText("Carla"));
    await user.click(view.getByRole("button", { name: /Quitar a Carla/i }));
    assert.ok(view.getByText(/Modificaste el equipo/i));
    assert.equal(view.queryByText("88% de afinidad"), null);
    assert.ok(view.getByText(/5 de 6 integrantes/i));
    const useBtn = view.getByRole("button", { name: /Usar este equipo/i });
    assert.ok((useBtn as HTMLButtonElement).disabled);
  });

  it("recompletes with locks and restores score", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => view.getByText("Carla"));
    await user.click(view.getByRole("button", { name: /Quitar a Carla/i }));
    await user.click(view.getByRole("button", { name: /Completar nuevamente con IA/i }));
    await waitFor(() => {
      assert.ok(view.getByText("88% de afinidad"));
    });
    assert.equal(postCalls.length, 2);
    const second = postCalls[1]!.body as { lockedEmployeeIds: string[] };
    assert.ok(Array.isArray(second.lockedEmployeeIds));
  });

  it("sends effectiveDate for recurring operations", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel({ operationKind: "RECURRING" });
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => assert.equal(postCalls.length, 1));
    const body = postCalls[0]!.body as { effectiveDate?: string; teamSize?: number };
    assert.ok(body.effectiveDate);
    assert.match(body.effectiveDate!, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(body.teamSize, 6);
  });

  it("shows backend 409 error", async () => {
    scopedApiClient.post = (async () => {
      throw new ApiError("No hay suficientes colaboradores", "INSUFFICIENT_ELIGIBLE_EMPLOYEES", 409);
    }) as typeof scopedApiClient.post;
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => {
      assert.ok(view.getByText(/suficientes colaboradores/i));
    });
  });

  it("calls batch assign on success and reports partial", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let calls = 0;
    let lastResult: { status: string; skipped: unknown[] } | null = null;
    const onAssign = async () => {
      calls += 1;
      return {
        status: "partial" as const,
        added: ["e1"],
        skipped: [{ employeeId: "e2", reason: "conflicto" }],
      };
    };
    const view = renderPanel({
      onAssign,
      onResult: (result) => {
        lastResult = result;
      },
    });
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => view.getByText("Ana"));
    assert.equal(postCalls.length, 1);
    await user.click(view.getByRole("button", { name: /Usar este equipo/i }));
    await waitFor(() => {
      assert.equal(calls, 1);
      assert.equal(lastResult?.status, "partial");
      assert.equal(lastResult?.skipped.length, 1);
      // Partial assign triggers a fresh recommendation to refresh the draft.
      assert.ok(postCalls.length >= 2);
    });
  });

  it("Generar otra opción navigates alternatives without new POST", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Armar equipo con IA/i }));
    await waitFor(() => view.getByText("Ana"));
    assert.equal(postCalls.length, 1);
    await user.click(view.getByRole("button", { name: /Generar otra opción/i }));
    assert.equal(postCalls.length, 1);
    assert.ok(view.getByText("Gina"));
  });
});
