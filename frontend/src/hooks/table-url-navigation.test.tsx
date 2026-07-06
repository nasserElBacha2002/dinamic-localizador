import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useListBackNavigation } from "./useListBackNavigation";
import { useListNavigationState } from "./useListNavigationState";
import { useTableUrlState } from "./useTableUrlState";
import { navigateWithListContext } from "../utils/list-navigation";

const LIST_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  status: "" as "" | "SCHEDULED" | "COMPLETED",
};

const LIST_FIELDS = {
  status: { type: "enum", values: ["", "SCHEDULED", "COMPLETED"] },
} as const;

function OperationsListHarness() {
  const navigate = useNavigate();
  const location = useLocation();
  const table = useTableUrlState({
    defaults: LIST_DEFAULTS,
    fields: LIST_FIELDS,
  });

  return (
    <div>
      <span data-testid="url">{`${location.pathname}${location.search}`}</span>
      <span data-testid="page">{table.page}</span>
      <span data-testid="status">{table.state.status}</span>
      <span data-testid="search">{table.state.search}</span>
      <input
        aria-label="Buscar"
        value={table.searchInput}
        onChange={(event) => table.setSearch(event.target.value)}
      />
      <button type="button" onClick={() => table.setField("status", "SCHEDULED")}>
        Filtrar programadas
      </button>
      <button type="button" onClick={() => table.setPage(2)}>
        Página 2
      </button>
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
