/**
 * Quick-links component tests with controllable module/permission fixtures.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mock } from "node:test";
import type { CompanyModule } from "../../types/company-module";

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
  (["attendance", "absences", "reports"] as const).map((moduleKey) => ({
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
  data: {
    permissions: ["attendance:read", "absences:read", "reports:read"],
  },
};

mock.module("../../hooks/useCompanyModules", {
  namedExports: {
    useCompanyModules: () => modulesQueryState,
  },
});

mock.module("../../hooks/useCompanyUsers", {
  namedExports: {
    useCompanyPermissions: () => permissionsQueryState,
  },
});

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter } from "react-router";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

let EmployeeModuleQuickLinks: typeof import("./EmployeeModuleQuickLinks").EmployeeModuleQuickLinks;

before(async () => {
  ({ EmployeeModuleQuickLinks } = await import("./EmployeeModuleQuickLinks"));
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
    data: {
      permissions: ["attendance:read", "absences:read", "reports:read"],
    },
  };
});

afterEach(() => {
  cleanup();
});

describe("EmployeeModuleQuickLinks component", () => {
  it("renders three real links with employeeIds (not the employee name)", () => {
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeeModuleQuickLinks employeeId={EMPLOYEE_ID} />
        </MemoryRouter>
      </MantineProvider>,
    );

    const attendance = view.getByRole("link", { name: "Ver asistencias" }) as HTMLAnchorElement;
    const absences = view.getByRole("link", { name: "Ver ausencias" }) as HTMLAnchorElement;
    const statistics = view.getByRole("link", { name: "Ver estadísticas" }) as HTMLAnchorElement;

    assert.equal(attendance.getAttribute("href"), `/attendance?employeeIds=${EMPLOYEE_ID}`);
    assert.match(absences.getAttribute("href") ?? "", /status=all/);
    assert.match(statistics.getAttribute("href") ?? "", /tab=employee/);
    assert.doesNotMatch(attendance.getAttribute("href") ?? "", /Ada|Lovelace|name=/i);
  });

  it("renders nothing while modules are loading", () => {
    modulesQueryState = { isPending: true, isError: false, data: undefined };
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeeModuleQuickLinks employeeId={EMPLOYEE_ID} />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.equal(view.queryByTestId("employee-module-quick-links"), null);
    assert.equal(view.queryByRole("link", { name: "Ver asistencias" }), null);
  });

  it("renders nothing while permissions are loading", () => {
    permissionsQueryState = { isPending: true, isError: false, data: undefined };
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeeModuleQuickLinks employeeId={EMPLOYEE_ID} />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.equal(view.queryByTestId("employee-module-quick-links"), null);
  });

  it("fails closed when modules query errors", () => {
    modulesQueryState = { isPending: false, isError: true, data: undefined };
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeeModuleQuickLinks employeeId={EMPLOYEE_ID} />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.equal(view.queryByRole("link"), null);
  });

  it("fails closed when permissions query errors", () => {
    permissionsQueryState = { isPending: false, isError: true, data: undefined };
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeeModuleQuickLinks employeeId={EMPLOYEE_ID} />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.equal(view.queryByRole("link"), null);
  });

  it("hides absences link when that module is disabled", () => {
    modulesQueryState = {
      isPending: false,
      isError: false,
      data: modulesFixture().map((module) =>
        module.moduleKey === "absences" ? { ...module, isEnabled: false } : module,
      ),
    };
    const view = render(
      <MantineProvider>
        <MemoryRouter>
          <EmployeeModuleQuickLinks employeeId={EMPLOYEE_ID} />
        </MemoryRouter>
      </MantineProvider>,
    );
    assert.ok(view.getByRole("link", { name: "Ver asistencias" }));
    assert.equal(view.queryByRole("link", { name: "Ver ausencias" }), null);
    assert.ok(view.getByRole("link", { name: "Ver estadísticas" }));
  });
});
