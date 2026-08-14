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
import { WorkTeamAiCreationPanel } from "./WorkTeamAiCreationPanel";

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

function member(id: string, name: string): TeamRecommendationMember {
  return {
    employee: emp(id, name),
    alreadyAssigned: false,
    locked: false,
    role: "SUGGESTED",
  };
}

const teamResponse = (): TeamRecommendationResponse => ({
  operationId: null,
  serviceId: null,
  algorithmVersion: "workforce-team-recommendation-v1",
  generatedAt: "2026-08-14T12:00:00.000Z",
  requestedTeamSize: 6,
  existingMemberCount: 0,
  lockedMemberCount: 0,
  slotsToFill: 6,
  candidateCount: 8,
  pairCount: 3,
  recommendations: [
    {
      rank: 1,
      score: 0.81,
      complete: true,
      members: [
        member("w1", "Walt"),
        member("w2", "Will"),
        member("w3", "Wendy"),
        member("w4", "Willa"),
        member("w5", "Wes"),
        member("w6", "Wade"),
      ],
      reasons: [
        {
          code: "TEAM_HISTORY_COVERAGE",
          params: { members: 6, membersWithConnections: 4 },
        },
      ],
    },
    {
      rank: 2,
      score: 0.6,
      complete: true,
      members: [
        member("w1", "Walt"),
        member("w2", "Will"),
        member("w3", "Wendy"),
        member("w4", "Willa"),
        member("w5", "Wes"),
        member("w7", "Wynn"),
      ],
      reasons: [{ code: "TEAM_RECENT_COLLABORATION", params: { recentPairCount: 1 } }],
    },
  ],
});

function renderPanel(onApplyMembers: (ids: string[]) => void = () => undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
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
          <WorkTeamAiCreationPanel onApplyMembers={onApplyMembers} />
        </MantineProvider>
      </CompanyContext.Provider>
    </QueryClientProvider>,
  );
}

describe("WorkTeamAiCreationPanel", () => {
  let postBodies: unknown[] = [];
  const originalPost = scopedApiClient.post;
  const originalGet = scopedApiClient.get;

  beforeEach(() => {
    setRuntimeCompanyId("company-1");
    postBodies = [];
    scopedApiClient.get = (async () => ({
      data: { data: [], meta: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } },
    })) as typeof scopedApiClient.get;
    scopedApiClient.post = (async (_url: string, body?: unknown) => {
      postBodies.push(body);
      return { data: { data: teamResponse() } };
    }) as typeof scopedApiClient.post;
  });

  afterEach(() => {
    scopedApiClient.post = originalPost;
    scopedApiClient.get = originalGet;
    clearActiveCompanyId();
    cleanup();
  });

  it("opens AI assist, generates, navigates alternative, and applies members", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let applied: string[] = [];
    const view = renderPanel((ids) => {
      applied = ids;
    });

    await user.click(view.getByRole("button", { name: /Crear grupo con IA/i }));
    await user.click(view.getByRole("button", { name: /Generar equipo/i }));
    await waitFor(() => assert.ok(view.getByText("81% de afinidad")));
    assert.ok(view.getByText("Walt"));

    await user.click(view.getByRole("button", { name: /Ver alternativa 2/i }));
    assert.ok(view.getByText("Wynn"));
    assert.ok(view.getByText("60% de afinidad"));
    assert.equal(view.queryByText("Wade"), null);

    await user.click(view.getByRole("button", { name: /Usar estos integrantes/i }));
    assert.deepEqual(applied.sort(), ["w1", "w2", "w3", "w4", "w5", "w7"].sort());
  });

  it("marks stale/incomplete and recompletes", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Crear grupo con IA/i }));
    await user.click(view.getByRole("button", { name: /Generar equipo/i }));
    await waitFor(() => view.getByText("Wes"));
    await user.click(view.getByRole("button", { name: "Quitar a Wes" }));
    assert.ok(view.getByText(/Modificaste el equipo/i));
    assert.ok(view.getByText(/5 de 6/i));
    assert.ok(
      (view.getByRole("button", { name: /Usar estos integrantes/i }) as HTMLButtonElement).disabled,
    );

    await user.click(view.getByRole("button", { name: /Completar nuevamente con IA/i }));
    await waitFor(() => assert.ok(view.getByText("81% de afinidad")));
    assert.equal(postBodies.length, 2);
  });

  it("shows backend error", async () => {
    scopedApiClient.post = (async () => {
      throw new ApiError("falló", "UNEXPECTED", 500);
    }) as typeof scopedApiClient.post;
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Crear grupo con IA/i }));
    await user.click(view.getByRole("button", { name: /Generar equipo/i }));
    await waitFor(() => assert.ok(view.getByText(/falló/i)));
  });

  it("passes optional serviceId in request body", async () => {
    scopedApiClient.get = (async () => ({
      data: {
        data: [{ id: "svc-9", name: "Sucursal 9", address: null, active: true }],
        meta: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
      },
    })) as typeof scopedApiClient.get;

    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await user.click(view.getByRole("button", { name: /Crear grupo con IA/i }));
    await user.click(view.getByRole("button", { name: /Generar equipo/i }));
    await waitFor(() => assert.equal(postBodies.length, 1));
    const body = postBodies[0] as { teamSize: number; alternatives: number; serviceId: string | null };
    assert.equal(body.teamSize, 6);
    assert.equal(body.alternatives, 3);
    assert.ok("serviceId" in body);
  });
});
