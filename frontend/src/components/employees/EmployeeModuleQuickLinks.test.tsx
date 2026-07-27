/**
 * Quick-links unit test: mock module/permission hooks before importing the component.
 */
import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import { mock } from "node:test";

mock.module("../../hooks/useCompanyModules", {
  namedExports: {
    useCompanyModules: () => ({
      isPending: false,
      isError: false,
      data: [
        {
          companyId: "co-1",
          moduleKey: "attendance",
          isEnabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          companyId: "co-1",
          moduleKey: "absences",
          isEnabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          companyId: "co-1",
          moduleKey: "reports",
          isEnabled: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    }),
  },
});

mock.module("../../hooks/useCompanyUsers", {
  namedExports: {
    useCompanyPermissions: () => ({
      isPending: false,
      data: {
        companyId: "co-1",
        companyName: "Empresa Test",
        role: "ADMIN",
        isPlatformAdmin: false,
        permissions: [
          "attendance:read",
          "absences:read",
          "reports:read",
        ],
      },
    }),
  },
});

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { MemoryRouter } from "react-router";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

const { EmployeeModuleQuickLinks } = await import("./EmployeeModuleQuickLinks");

afterEach(() => {
  cleanup();
});

describe("EmployeeModuleQuickLinks", () => {
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

    assert.match(attendance.getAttribute("href") ?? "", new RegExp(`employeeIds=${EMPLOYEE_ID}`));
    assert.equal(attendance.getAttribute("href"), `/attendance?employeeIds=${EMPLOYEE_ID}`);

    assert.match(absences.getAttribute("href") ?? "", new RegExp(`employeeIds=${EMPLOYEE_ID}`));
    assert.match(absences.getAttribute("href") ?? "", /status=all/);

    assert.match(statistics.getAttribute("href") ?? "", new RegExp(`employeeIds=${EMPLOYEE_ID}`));
    assert.match(statistics.getAttribute("href") ?? "", /tab=employee/);

    assert.doesNotMatch(attendance.getAttribute("href") ?? "", /Ada|Lovelace|name=/i);
  });
});
