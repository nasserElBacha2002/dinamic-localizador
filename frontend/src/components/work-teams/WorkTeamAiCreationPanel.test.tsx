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

const teamResponse = (locked: string[] = []): TeamRecommendationResponse => ({
  operationId: null,
  serviceId: null,
  algorithmVersion: "workforce-team-recommendation-v1",
  generatedAt: "2026-08-14T12:00:00.000Z",
  requestedTeamSize: 6,
  existingMemberCount: 0,
  lockedMemberCount: locked.length,
  slotsToFill: 6 - locked.length,
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
      ].map((m) =>
        locked.includes(m.employee.id)
          ? { ...m, locked: true, role: "LOCKED" as const }
          : m,
      ),
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

function renderPanel(
  selectedEmployeeIds: string[] = [],
  onApplyMembers: (ids: string[]) => void = () => undefined,
) {
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
          <WorkTeamAiCreationPanel
            selectedEmployeeIds={selectedEmployeeIds}
            onApplyMembers={onApplyMembers}
          />
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

  it("shows suggestion automatically on create", async () => {
    const view = renderPanel();
    await waitFor(() => assert.ok(view.getByText("81% de afinidad")));
    assert.ok(view.getByText(/Sugerencia de IA/i));
    assert.ok(view.getByText(/Walt/i));
    assert.equal(postBodies.length, 1);
  });

  it("sends selected members as lockedEmployeeIds", async () => {
    renderPanel(["w1"]);
    await waitFor(() => assert.ok(postBodies.length >= 1));
    const body = postBodies[0] as { lockedEmployeeIds: string[]; teamSize: number };
    assert.deepEqual(body.lockedEmployeeIds, ["w1"]);
    assert.equal(body.teamSize, 6);
  });

  it("applies suggestion to multi-select without creating the group", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    let applied: string[] = [];
    const view = renderPanel([], (ids) => {
      applied = ids;
    });
    await waitFor(() => view.getByText("81% de afinidad"));
    await user.click(view.getByRole("button", { name: /Aplicar sugerencia/i }));
    assert.deepEqual(applied.sort(), ["w1", "w2", "w3", "w4", "w5", "w6"].sort());
  });

  it("navigates alternatives without extra POST", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const view = renderPanel();
    await waitFor(() => view.getByText("81% de afinidad"));
    assert.equal(postBodies.length, 1);
    await user.click(view.getByRole("button", { name: /Otra opción/i }));
    assert.equal(postBodies.length, 1);
    assert.ok(view.getByText("60% de afinidad"));
    assert.equal(view.queryByText(/Wade/i), null);
  });

  it("hides auto suggestion when selection already fills team size", async () => {
    const view = renderPanel(["w1", "w2", "w3", "w4", "w5", "w6"]);
    await waitFor(() =>
      assert.ok(view.getByText(/El equipo ya tiene el tamaño deseado/i)),
    );
    assert.equal(postBodies.length, 0);
    assert.equal(view.queryByText(/Aplicar sugerencia/i), null);
  });

  it("after apply shows Equipo aplicado and stops refetch", async () => {
    const user = userEvent.setup({ document: globalThis.document });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    function Harness() {
      const [ids, setIds] = React.useState<string[]>([]);
      return (
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
              <WorkTeamAiCreationPanel selectedEmployeeIds={ids} onApplyMembers={setIds} />
            </MantineProvider>
          </CompanyContext.Provider>
        </QueryClientProvider>
      );
    }

    const view = render(<Harness />);
    await waitFor(() => view.getByText("81% de afinidad"));
    const postsBeforeApply = postBodies.length;
    await user.click(view.getByRole("button", { name: /Aplicar sugerencia/i }));
    await waitFor(() => assert.ok(view.getByText(/Equipo aplicado/i)));
    assert.equal(postBodies.length, postsBeforeApply);
  });

  it("keeps showing retry when backend errors", async () => {
    scopedApiClient.post = (async () => {
      throw new ApiError("falló", "UNEXPECTED", 500);
    }) as typeof scopedApiClient.post;
    const view = renderPanel();
    await waitFor(() => assert.ok(view.getByText(/falló/i)));
    assert.ok(view.getByRole("button", { name: /Reintentar/i }));
  });
});
