import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React, { useMemo } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { useTableUrlState } from "../hooks/useTableUrlState";
import { ATTENDANCE_TABLE_DEFAULTS, ATTENDANCE_TABLE_FIELDS } from "../pages/attendance/attendance-list-table-state";
import {
  buildOperationTableDefaults,
  OPERATION_TABLE_FIELDS,
} from "../pages/operations/operations-list-table-state";
import {
  SERVICE_TABLE_DEFAULTS,
  SERVICE_TABLE_FIELDS,
} from "../pages/services/services-list-table-state";
import {
  buildStatisticsTableDefaults,
  STATISTICS_TABLE_FIELDS,
} from "../pages/statistics/statistics-table-state";
import { resolveCascadeParentChange } from "../design-system/filters/cascading-filter-change";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  setupDomEnvironment();
});

describe("filter reset screen contracts", () => {
  it("Operations: restores dynamic date defaults while keeping pageSize/sort", async () => {
    const dateDefaults = {
      datePreset: "custom",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-07",
    };
    const defaults = buildOperationTableDefaults(dateDefaults);

    function Harness() {
      const location = useLocation();
      const table = useTableUrlState({
        defaults,
        fields: OPERATION_TABLE_FIELDS,
      });
      return (
        <div>
          <span data-testid="url">{`${location.pathname}${location.search}`}</span>
          <span data-testid="date-from">{table.state.dateFrom}</span>
          <span data-testid="status">{table.state.status}</span>
          <span data-testid="page">{table.page}</span>
          <span data-testid="page-size">{table.pageSize}</span>
          <span data-testid="sort-by">{table.sortBy}</span>
          <button type="button" onClick={() => table.setField("status", "SCHEDULED")}>
            status
          </button>
          <button type="button" onClick={() => table.setField("dateFrom", "2026-01-01")}>
            date
          </button>
          <button type="button" onClick={() => table.setPage(3)}>
            page
          </button>
          <button type="button" onClick={() => table.setPageSize(25)}>
            size
          </button>
          <button type="button" onClick={() => table.setSorting("status", "desc")}>
            sort
          </button>
          <button type="button" onClick={() => table.resetFilters()}>
            clear
          </button>
        </div>
      );
    }

    const view = render(
      <MemoryRouter initialEntries={["/operations"]}>
        <Routes>
          <Route path="/operations" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: "status" }));
    fireEvent.click(view.getByRole("button", { name: "date" }));
    fireEvent.click(view.getByRole("button", { name: "page" }));
    fireEvent.click(view.getByRole("button", { name: "size" }));
    fireEvent.click(view.getByRole("button", { name: "sort" }));
    fireEvent.click(view.getByRole("button", { name: "clear" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("status").textContent, "");
      assert.equal(view.getByTestId("date-from").textContent, "2026-07-01");
      assert.equal(view.getByTestId("page").textContent, "1");
      assert.equal(view.getByTestId("page-size").textContent, "25");
      assert.equal(view.getByTestId("sort-by").textContent, "status");
    });
  });

  it("Services: clears locality/neighborhood atomically without orphan barrio", async () => {
    function Harness() {
      const location = useLocation();
      const table = useTableUrlState({
        defaults: SERVICE_TABLE_DEFAULTS,
        fields: SERVICE_TABLE_FIELDS,
      });
      const barrioDisabled = !table.state.locality;

      return (
        <div>
          <span data-testid="url">{`${location.pathname}${location.search}`}</span>
          <span data-testid="locality">{table.state.locality}</span>
          <span data-testid="neighborhood">{table.state.neighborhood}</span>
          <span data-testid="barrio-disabled">{String(barrioDisabled)}</span>
          <button
            type="button"
            onClick={() => {
              const change = resolveCascadeParentChange(table.state.locality, "CABA");
              if (!change) {
                return;
              }
              table.setState({
                locality: change.parentValue,
                neighborhood: change.childValue,
              });
            }}
          >
            set-locality
          </button>
          <button
            type="button"
            onClick={() => table.setField("neighborhood", "Palermo")}
          >
            set-barrio
          </button>
          <button type="button" onClick={() => table.resetFilters()}>
            clear
          </button>
        </div>
      );
    }

    const view = render(
      <MemoryRouter initialEntries={["/services"]}>
        <Routes>
          <Route path="/services" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: "set-locality" }));
    fireEvent.click(view.getByRole("button", { name: "set-barrio" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("locality").textContent, "CABA");
      assert.equal(view.getByTestId("neighborhood").textContent, "Palermo");
      assert.equal(view.getByTestId("barrio-disabled").textContent, "false");
    });

    fireEvent.click(view.getByRole("button", { name: "clear" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("locality").textContent, "");
      assert.equal(view.getByTestId("neighborhood").textContent, "");
      assert.equal(view.getByTestId("barrio-disabled").textContent, "true");
      assert.doesNotMatch(view.getByTestId("url").textContent ?? "", /neighborhood=/);
    });
  });

  it("Statistics: keeps tab, resets nested pages, treats ID lists as sets", async () => {
    const defaults = buildStatisticsTableDefaults({
      datePreset: "last_30_days",
      dateFrom: "2026-06-21",
      dateTo: "2026-07-21",
    });

    function Harness() {
      const table = useTableUrlState({
        defaults,
        fields: STATISTICS_TABLE_FIELDS,
        filterRetainKeys: [
          "tab",
          "empPageSize",
          "opPageSize",
          "svcPageSize",
          "empSortBy",
          "empSortOrder",
          "opSortBy",
          "opSortOrder",
          "svcSortBy",
          "svcSortOrder",
        ],
        filterActivityIgnoreKeys: [
          "tab",
          "empPage",
          "empPageSize",
          "opPage",
          "opPageSize",
          "svcPage",
          "svcPageSize",
          "empSortBy",
          "empSortOrder",
          "opSortBy",
          "opSortOrder",
          "svcSortBy",
          "svcSortOrder",
        ],
      });

      return (
        <div>
          <span data-testid="tab">{table.state.tab}</span>
          <span data-testid="emp-page">{String(table.state.empPage)}</span>
          <span data-testid="op-page">{String(table.state.opPage)}</span>
          <span data-testid="svc-page">{String(table.state.svcPage)}</span>
          <span data-testid="emp-page-size">{String(table.state.empPageSize)}</span>
          <span data-testid="operation-ids">{table.state.operationIds.join(",")}</span>
          <span data-testid="active">{String(table.hasActiveFilters)}</span>
          <button type="button" onClick={() => table.setField("tab", "employee")}>
            tab
          </button>
          <button type="button" onClick={() => table.setField("empPage", 4)}>
            emp-page
          </button>
          <button type="button" onClick={() => table.setField("opPage", 5)}>
            op-page
          </button>
          <button type="button" onClick={() => table.setField("svcPage", 6)}>
            svc-page
          </button>
          <button type="button" onClick={() => table.setField("empPageSize", 25)}>
            emp-size
          </button>
          <button
            type="button"
            onClick={() => table.setField("operationIds", ["b", "a"])}
          >
            ops
          </button>
          <button type="button" onClick={() => table.resetFilters()}>
            clear
          </button>
        </div>
      );
    }

    const view = render(
      <MemoryRouter initialEntries={["/statistics"]}>
        <Routes>
          <Route path="/statistics" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: "tab" }));
    fireEvent.click(view.getByRole("button", { name: "emp-page" }));
    fireEvent.click(view.getByRole("button", { name: "op-page" }));
    fireEvent.click(view.getByRole("button", { name: "svc-page" }));
    fireEvent.click(view.getByRole("button", { name: "emp-size" }));
    fireEvent.click(view.getByRole("button", { name: "ops" }));
    fireEvent.click(view.getByRole("button", { name: "clear" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("tab").textContent, "employee");
      assert.equal(view.getByTestId("emp-page").textContent, "1");
      assert.equal(view.getByTestId("op-page").textContent, "1");
      assert.equal(view.getByTestId("svc-page").textContent, "1");
      assert.equal(view.getByTestId("emp-page-size").textContent, "25");
      assert.equal(view.getByTestId("operation-ids").textContent, "");
      assert.equal(view.getByTestId("active").textContent, "false");
    });
  });

  it("Attendance: resets multiselects and keeps recordType default", async () => {
    function Harness() {
      const table = useTableUrlState({
        defaults: ATTENDANCE_TABLE_DEFAULTS,
        fields: ATTENDANCE_TABLE_FIELDS,
      });
      return (
        <div>
          <span data-testid="record-type">{table.state.recordType}</span>
          <span data-testid="employee-ids">{table.state.employeeIds.join(",")}</span>
          <span data-testid="active-count">{String(table.activeFilterCount)}</span>
          <button
            type="button"
            onClick={() => table.setField("employeeIds", ["e2", "e1"])}
          >
            employees
          </button>
          <button type="button" onClick={() => table.setField("recordType", "simulation")}>
            simulation
          </button>
          <button type="button" onClick={() => table.resetFilters()}>
            clear
          </button>
        </div>
      );
    }

    const view = render(
      <MemoryRouter initialEntries={["/attendance"]}>
        <Routes>
          <Route path="/attendance" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(view.getByRole("button", { name: "employees" }));
    fireEvent.click(view.getByRole("button", { name: "simulation" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("active-count").textContent, "2");
    });

    fireEvent.click(view.getByRole("button", { name: "clear" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("record-type").textContent, "real");
      assert.equal(view.getByTestId("employee-ids").textContent, "");
      assert.equal(view.getByTestId("active-count").textContent, "0");
    });
  });

  it("Employees search debounce: reset cancels pending query and issues one default request", async () => {
    const queryKeys: string[] = [];
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    function Harness() {
      const table = useTableUrlState({
        defaults: {
          page: 1,
          pageSize: 10,
          search: "",
          sortBy: "name",
          sortOrder: "asc" as const,
        },
        searchDebounceMs: 40,
      });

      const filters = useMemo(
        () => ({
          page: table.page,
          search: table.state.search,
          sortBy: table.sortBy,
        }),
        [table.page, table.sortBy, table.state.search],
      );

      useQuery({
        queryKey: ["employees-list", filters],
        queryFn: async () => {
          queryKeys.push(JSON.stringify(filters));
          return [];
        },
      });

      return (
        <div>
          <input
            aria-label="Buscar"
            value={table.searchInput}
            onChange={(event) => table.setSearch(event.target.value)}
          />
          <button type="button" onClick={() => table.resetFilters()}>
            clear
          </button>
          <span data-testid="search">{table.state.search}</span>
        </div>
      );
    }

    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/employees"]}>
          <Routes>
            <Route path="/employees" element={<Harness />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      assert.ok(queryKeys.length >= 1);
    });
    const baseline = queryKeys.length;

    fireEvent.change(view.getByLabelText("Buscar"), { target: { value: "texto-viejo" } });
    fireEvent.click(view.getByRole("button", { name: "clear" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("search").textContent, "");
      assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    const afterReset = queryKeys.slice(baseline);
    assert.ok(
      afterReset.every((key) => !key.includes("texto-viejo")),
      `unexpected stale search in queries: ${afterReset.join(" | ")}`,
    );
    assert.equal(view.getByTestId("search").textContent, "");
  });

  it("atomic reset: multiple filter changes then one clear produce a single default query key", async () => {
    const queryKeys: string[] = [];
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    function Harness() {
      const table = useTableUrlState({
        defaults: {
          page: 1,
          pageSize: 10,
          status: "",
          search: "",
        },
        fields: {
          status: { type: "enum", values: ["", "SCHEDULED", "COMPLETED"] },
        },
      });

      const filters = useMemo(
        () => ({
          page: table.page,
          status: table.state.status,
          search: table.state.search,
        }),
        [table.page, table.state.search, table.state.status],
      );

      useQuery({
        queryKey: ["ops-atomic", filters],
        queryFn: async () => {
          queryKeys.push(JSON.stringify(filters));
          return [];
        },
      });

      return (
        <div>
          <button type="button" onClick={() => table.setField("status", "SCHEDULED")}>
            status
          </button>
          <button type="button" onClick={() => table.setField("search", "x")}>
            search
          </button>
          <button type="button" onClick={() => table.setPage(3)}>
            page
          </button>
          <button
            type="button"
            onClick={() => {
              // Sequential setField would emit multiple URL writes; reset must be one writeState.
              table.resetFilters();
            }}
          >
            clear
          </button>
          <span data-testid="status">{table.state.status}</span>
        </div>
      );
    }

    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/operations"]}>
          <Routes>
            <Route path="/operations" element={<Harness />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => assert.ok(queryKeys.length >= 1));
    fireEvent.click(view.getByRole("button", { name: "status" }));
    fireEvent.click(view.getByRole("button", { name: "search" }));
    fireEvent.click(view.getByRole("button", { name: "page" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("status").textContent, "SCHEDULED");
    });

    const beforeClear = queryKeys.length;
    fireEvent.click(view.getByRole("button", { name: "clear" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("status").textContent, "");
    });

    const clearKeys = queryKeys.slice(beforeClear);
    assert.equal(clearKeys.length, 1);
    assert.equal(clearKeys[0], JSON.stringify({ page: 1, status: "", search: "" }));
  });
});
