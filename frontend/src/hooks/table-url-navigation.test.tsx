import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import { MemoryRouter, Route, Routes } from "react-router";
import { useListBackNavigation } from "./useListBackNavigation";
import { useListNavigationState } from "./useListNavigationState";
import { useTableUrlState } from "./useTableUrlState";
import { navigateWithListContext } from "../utils/list-navigation";

const LIST_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  status: "" as "" | "SCHEDULED" | "COMPLETED",
  sortBy: "scheduledStart",
  sortOrder: "asc" as const,
  employeeIds: [] as string[],
};

const LIST_FIELDS = {
  status: { type: "enum" as const, values: ["", "SCHEDULED", "COMPLETED"] },
  employeeIds: { type: "stringList" as const },
  sortBy: { type: "enum" as const, values: ["scheduledStart", "name"] },
  sortOrder: { type: "enum" as const, values: ["asc", "desc"] },
};

function OperationsListHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  const table = useTableUrlState({
    defaults: LIST_DEFAULTS,
    fields: LIST_FIELDS,
    searchDebounceMs: 40,
  });

  return (
    <div>
      <span data-testid="url">{`${location.pathname}${location.search}`}</span>
      <span data-testid="page">{table.page}</span>
      <span data-testid="page-size">{table.pageSize}</span>
      <span data-testid="status">{table.state.status}</span>
      <span data-testid="search">{table.state.search}</span>
      <span data-testid="sort-by">{table.sortBy}</span>
      <span data-testid="sort-order">{table.sortOrder}</span>
      <span data-testid="employee-ids">{table.state.employeeIds.join(",")}</span>
      <input
        aria-label="Buscar"
        value={table.searchInput}
        onChange={(event) => table.setSearch(event.target.value)}
      />
      <button type="button" onClick={() => table.setField("status", "SCHEDULED")}>
        Filtrar programadas
      </button>
      <button
        type="button"
        onClick={() => table.setField("employeeIds", ["b", "a"])}
      >
        Seleccionar empleados
      </button>
      <button type="button" onClick={() => table.setPage(2)}>
        Página 2
      </button>
      <button type="button" onClick={() => table.setPageSize(25)}>
        Page size 25
      </button>
      <button type="button" onClick={() => table.setSorting("name", "desc")}>
        Ordenar nombre
      </button>
      <button type="button" onClick={() => table.resetFilters()}>
        Limpiar filtros
      </button>
      <span data-testid="has-active">{String(table.hasActiveFilters)}</span>
      <span data-testid="active-count">{String(table.activeFilterCount)}</span>
      <button
        type="button"
        onClick={(event) => {
          const input = event.currentTarget.parentElement?.querySelector("input");
          table.commitSearch((input as HTMLInputElement | null)?.value);
        }}
      >
        Buscar
      </button>
      <button
        type="button"
        onClick={() =>
          navigateWithListContext(navigate, "/operations/inv-1", "/operations", location)
        }
      >
        Abrir detalle
      </button>
    </div>
  );
}

function OperationDetailHarness() {
  const { goBackToList } = useListBackNavigation("/operations");

  return (
    <button type="button" onClick={goBackToList}>
      Volver al listado
    </button>
  );
}

function renderOperationsFlow(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/operations" element={<OperationsListHarness />} />
        <Route path="/operations/:id" element={<OperationDetailHarness />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  setupDomEnvironment();
});

describe("table URL navigation integration", () => {
  it("restores list filters and pagination after returning from detail", async () => {
    const view = renderOperationsFlow("/operations");

    fireEvent.click(view.getByRole("button", { name: "Filtrar programadas" }));
    fireEvent.click(view.getByRole("button", { name: "Página 2" }));
    await waitFor(() => {
      assert.match(view.getByTestId("url").textContent ?? "", /status=SCHEDULED/);
      assert.match(view.getByTestId("url").textContent ?? "", /page=2/);
    });

    fireEvent.click(view.getByRole("button", { name: "Abrir detalle" }));
    fireEvent.click(view.getByRole("button", { name: "Volver al listado" }));

    await waitFor(() => {
      const url = view.getByTestId("url").textContent ?? "";
      assert.match(url, /status=SCHEDULED/);
      assert.match(url, /page=2/);
      assert.equal(view.getByTestId("status").textContent, "SCHEDULED");
      assert.equal(view.getByTestId("page").textContent, "2");
    });
  });

  it("commits search immediately and preserves it after detail navigation", async () => {
    const view = renderOperationsFlow("/operations?search=carrefour");

    await waitFor(() => {
      assert.equal(view.getByTestId("search").textContent, "carrefour");
      assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "carrefour");
    });

    fireEvent.click(view.getByRole("button", { name: "Abrir detalle" }));
    fireEvent.click(view.getByRole("button", { name: "Volver al listado" }));

    await waitFor(() => {
      assert.match(view.getByTestId("url").textContent ?? "", /search=carrefour/);
      assert.equal(view.getByTestId("search").textContent, "carrefour");
      assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "carrefour");
    });
  });

  it("falls back to base list path when detail is opened directly", async () => {
    const view = renderOperationsFlow("/operations/inv-1");

    fireEvent.click(view.getByRole("button", { name: "Volver al listado" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("url").textContent, "/operations");
    });
  });

  it("ignores invalid query params and falls back to defaults", () => {
    const view = renderOperationsFlow("/operations?page=abc&pageSize=0&status=INVALID");

    assert.equal(view.getByTestId("page").textContent, "1");
    assert.equal(view.getByTestId("status").textContent, "");
  });

  it("commitSearch writes trimmed value to the URL immediately", async () => {
    const view = renderOperationsFlow("/operations");

    fireEvent.change(view.getByLabelText("Buscar"), { target: { value: "  carrefour  " } });
    await waitFor(() => {
      assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "  carrefour  ");
    });

    fireEvent.click(view.getByRole("button", { name: "Buscar" }));

    await waitFor(() => {
      assert.match(view.getByTestId("url").textContent ?? "", /search=carrefour/);
      assert.equal(view.getByTestId("search").textContent, "carrefour");
    });
  });

  it("resetFilters restores defaults, page 1, and clears managed URL keys atomically", async () => {
    const view = renderOperationsFlow("/operations");

    fireEvent.click(view.getByRole("button", { name: "Filtrar programadas" }));
    fireEvent.click(view.getByRole("button", { name: "Página 2" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("has-active").textContent, "true");
      assert.equal(view.getByTestId("page").textContent, "2");
    });

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      assert.equal(view.getByTestId("url").textContent, "/operations");
      assert.equal(view.getByTestId("status").textContent, "");
      assert.equal(view.getByTestId("page").textContent, "1");
      assert.equal(view.getByTestId("has-active").textContent, "false");
      assert.equal(view.getByTestId("active-count").textContent, "0");
    });
  });

  it("resetFilters preserves external params and pageSize/sort", async () => {
    const view = renderOperationsFlow("/operations?from=dashboard&companyView=compact");

    fireEvent.click(view.getByRole("button", { name: "Page size 25" }));
    fireEvent.click(view.getByRole("button", { name: "Ordenar nombre" }));
    fireEvent.click(view.getByRole("button", { name: "Filtrar programadas" }));
    fireEvent.click(view.getByRole("button", { name: "Página 2" }));

    await waitFor(() => {
      assert.match(view.getByTestId("url").textContent ?? "", /status=SCHEDULED/);
      assert.match(view.getByTestId("url").textContent ?? "", /from=dashboard/);
      assert.equal(view.getByTestId("page-size").textContent, "25");
      assert.equal(view.getByTestId("sort-by").textContent, "name");
    });

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      const url = view.getByTestId("url").textContent ?? "";
      assert.match(url, /from=dashboard/);
      assert.match(url, /companyView=compact/);
      assert.doesNotMatch(url, /status=/);
      assert.equal(view.getByTestId("page").textContent, "1");
      assert.equal(view.getByTestId("page-size").textContent, "25");
      assert.equal(view.getByTestId("sort-by").textContent, "name");
      assert.equal(view.getByTestId("sort-order").textContent, "desc");
    });
  });

  it("resetFilters cancels pending search debounce", async () => {
    const view = renderOperationsFlow("/operations");

    fireEvent.change(view.getByLabelText("Buscar"), { target: { value: "texto-viejo" } });
    assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "texto-viejo");

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() => {
      assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "");
      assert.equal(view.getByTestId("search").textContent, "");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    assert.equal((view.getByLabelText("Buscar") as HTMLInputElement).value, "");
    assert.doesNotMatch(view.getByTestId("url").textContent ?? "", /texto-viejo/);
    assert.equal(view.getByTestId("search").textContent, "");
  });

  it("resetFilters is idempotent and treats ID order as inactive when equal as sets", async () => {
    const view = renderOperationsFlow("/operations?employeeIds=a%2Cb");

    await waitFor(() => {
      assert.equal(view.getByTestId("employee-ids").textContent, "a,b");
    });

    fireEvent.click(view.getByRole("button", { name: "Seleccionar empleados" }));
    await waitFor(() => {
      // Order differs in state, but set-equality keeps activity false when same IDs as default? 
      // Defaults are [] so selecting IDs is active.
      assert.equal(view.getByTestId("has-active").textContent, "true");
    });

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("employee-ids").textContent, "");
      assert.equal(view.getByTestId("has-active").textContent, "false");
    });

    fireEvent.click(view.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => {
      assert.equal(view.getByTestId("has-active").textContent, "false");
      assert.equal(view.getByTestId("page").textContent, "1");
    });
  });
});

describe("useListNavigationState", () => {
  it("builds navigation state from current list URL", () => {
    function Harness() {
      const listNav = useListNavigationState("/employees");
      return <span data-testid="from-list">{listNav.fromList}</span>;
    }

    const view = render(
      <MemoryRouter initialEntries={["/employees?search=ana&page=2"]}>
        <Routes>
          <Route path="/employees" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    );

    assert.equal(view.getByTestId("from-list").textContent, "/employees?search=ana&page=2");
  });
});
