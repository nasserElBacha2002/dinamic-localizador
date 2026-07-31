/**
 * Integration: FeatureRouteGuard matrix for entity detail vs edit routes.
 */
import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mock } from "node:test";
import type { CompanyModule } from "../types/company-module";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type ModulesQuery = {
  isPending: boolean;
  isError: boolean;
  data: CompanyModule[] | undefined;
};

type PermissionsQuery = {
  isPending: boolean;
  isError: boolean;
  data: { permissions: string[] } | undefined;
};

const modulesFixture = (): CompanyModule[] =>
  (["attendance", "operations", "absences", "reports"] as const).map((moduleKey) => ({
    companyId: "co-1",
    moduleKey,
    isEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

let modulesQueryState: ModulesQuery = {
  isPending: false,
  isError: false,
  data: modulesFixture(),
};

let permissionsQueryState: PermissionsQuery = {
  isPending: false,
  isError: false,
  data: { permissions: ["employees:read"] },
};

mock.module(pathToFileURL(path.join(srcRoot, "hooks/useCompanyModules.ts")).href, {
  namedExports: {
    useCompanyModules: () => modulesQueryState,
    useUpdateCompanyModules: () => ({ mutateAsync: async () => undefined }),
    useRefreshCompanyModules: () => () => undefined,
    companyModulesQueryKey: (companyId: string | undefined) => ["company-modules", companyId],
    companyModulesQueryOptions: () => ({}),
  },
});

mock.module(pathToFileURL(path.join(srcRoot, "hooks/useCompanyUsers.ts")).href, {
  namedExports: {
    useCompanyPermissions: () => permissionsQueryState,
    useCompanyUsers: () => ({ data: undefined, isPending: false }),
    useCreateCompanyUser: () => ({ mutateAsync: async () => undefined }),
    useUpdateCompanyUser: () => ({ mutateAsync: async () => undefined }),
    useDeactivateCompanyUser: () => ({ mutateAsync: async () => undefined }),
  },
});

import assert from "node:assert/strict";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { Route, Routes } from "react-router";
import {
  employeeAccess,
  employeeManage,
  operationAccess,
  operationManage,
  serviceAccess,
  serviceManage,
  workTeamAccess,
  workTeamManage,
} from "./entity-route-access";
import { LegacyOperationRedirect, LegacyServiceRedirect } from "./legacy-redirects";

let renderPage: typeof import("../test/render-page").renderPage;
let FeatureRouteGuard: typeof import("../components/company/FeatureRouteGuard").FeatureRouteGuard;

before(async () => {
  ({ renderPage } = await import("../test/render-page"));
  ({ FeatureRouteGuard } = await import("../components/company/FeatureRouteGuard"));
});

beforeEach(() => {
  modulesQueryState = {
    isPending: false,
    isError: false,
    data: modulesFixture(),
  };
  permissionsQueryState = {
    isPending: false,
    isError: false,
    data: { permissions: ["employees:read"] },
  };
});

afterEach(() => {
  cleanup();
});

function EntityRoutes({ Guard }: { Guard: typeof FeatureRouteGuard }) {
  return (
    <Routes>
      <Route
        path="/employees/:id"
        element={
          <Guard {...employeeAccess}>
            <div>EMPLOYEE_DETAIL</div>
          </Guard>
        }
      />
      <Route
        path="/employees/:id/edit"
        element={
          <Guard {...employeeManage}>
            <div>EMPLOYEE_EDIT</div>
          </Guard>
        }
      />
      <Route
        path="/services/:id"
        element={
          <Guard {...serviceAccess}>
            <div>SERVICE_DETAIL</div>
          </Guard>
        }
      />
      <Route
        path="/services/:id/edit"
        element={
          <Guard {...serviceManage}>
            <div>SERVICE_EDIT</div>
          </Guard>
        }
      />
      <Route
        path="/work-teams/:id"
        element={
          <Guard {...workTeamAccess}>
            <div>WORK_TEAM_DETAIL</div>
          </Guard>
        }
      />
      <Route
        path="/work-teams/:id/edit"
        element={
          <Guard {...workTeamManage}>
            <div>WORK_TEAM_EDIT</div>
          </Guard>
        }
      />
      <Route
        path="/operations/:id"
        element={
          <Guard {...operationAccess}>
            <div>OPERATION_DETAIL</div>
          </Guard>
        }
      />
      <Route
        path="/operations/:id/edit"
        element={
          <Guard {...operationManage}>
            <div>OPERATION_EDIT</div>
          </Guard>
        }
      />
    </Routes>
  );
}

async function expectText(route: string, permissions: string[], text: string) {
  permissionsQueryState = {
    isPending: false,
    isError: false,
    data: { permissions },
  };
  const view = renderPage(<EntityRoutes Guard={FeatureRouteGuard} />, { route });
  await waitFor(() => {
    assert.match(view.container.textContent ?? "", new RegExp(text));
  });
  return view;
}

describe("entity edit route guards", () => {
  it("allows read on detail and denies edit for employees", async () => {
    await expectText("/employees/e1", ["employees:read"], "EMPLOYEE_DETAIL");
    cleanup();
    await expectText("/employees/e1/edit", ["employees:read"], "Sin permisos");
  });

  it("allows manage on employee edit", async () => {
    await expectText("/employees/e1/edit", ["employees:manage"], "EMPLOYEE_EDIT");
  });

  it("applies the same matrix to services, work-teams and operations", async () => {
    await expectText("/services/s1", ["services:read"], "SERVICE_DETAIL");
    cleanup();
    await expectText("/services/s1/edit", ["services:read"], "Sin permisos");
    cleanup();
    await expectText("/services/s1/edit", ["services:manage"], "SERVICE_EDIT");
    cleanup();

    await expectText("/work-teams/w1", ["employees:read"], "WORK_TEAM_DETAIL");
    cleanup();
    await expectText("/work-teams/w1/edit", ["employees:read"], "Sin permisos");
    cleanup();
    await expectText("/work-teams/w1/edit", ["employees:manage"], "WORK_TEAM_EDIT");
    cleanup();

    await expectText("/operations/o1", ["operations:read"], "OPERATION_DETAIL");
    cleanup();
    await expectText("/operations/o1/edit", ["operations:read"], "Sin permisos");
    cleanup();
    await expectText("/operations/o1/edit", ["operations:manage"], "OPERATION_EDIT");
  });

  it("redirects legacy store and inventory detail paths without sending to /edit", async () => {
    const stores = renderPage(
      <Routes>
        <Route path="/stores/:id" element={<LegacyServiceRedirect />} />
        <Route path="/services/:id" element={<div>SERVICE_LEGACY_TARGET</div>} />
        <Route path="/services/:id/edit" element={<div>SERVICE_EDIT_SHOULD_NOT</div>} />
      </Routes>,
      { route: "/stores/svc-9" },
    );
    await waitFor(() => {
      assert.match(stores.container.textContent ?? "", /SERVICE_LEGACY_TARGET/);
    });
    assert.doesNotMatch(stores.container.textContent ?? "", /SERVICE_EDIT_SHOULD_NOT/);
    cleanup();

    const inventories = renderPage(
      <Routes>
        <Route path="/inventories/:id" element={<LegacyOperationRedirect />} />
        <Route path="/operations/:id" element={<div>OPERATION_LEGACY_TARGET</div>} />
        <Route path="/operations/:id/edit" element={<div>OPERATION_EDIT_SHOULD_NOT</div>} />
      </Routes>,
      { route: "/inventories/op-9" },
    );
    await waitFor(() => {
      assert.match(inventories.container.textContent ?? "", /OPERATION_LEGACY_TARGET/);
    });
    assert.doesNotMatch(inventories.container.textContent ?? "", /OPERATION_EDIT_SHOULD_NOT/);
  });
});
