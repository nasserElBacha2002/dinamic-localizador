import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { mockViewport } from "../../test/mock-match-media";
import { DataTable } from "./DataTable";

interface SampleRow {
  id: string;
  label: string;
  detail: string;
  clickable: boolean;
}

const columns = [
  { key: "label", header: "Label", sortable: true, getValue: (row: SampleRow) => row.label },
  { key: "detail", header: "Detail", getValue: (row: SampleRow) => row.detail },
];

const mobileCard = {
  title: (row: SampleRow) => row.label,
  subtitle: (row: SampleRow) => row.detail,
  fields: [
    {
      key: "detail",
      label: "Detalle",
      render: (row: SampleRow) => row.detail,
      priority: "primary" as const,
    },
  ],
  actions: (row: SampleRow) => (
    <button type="button" onClick={() => undefined} aria-label={`Acción ${row.id}`}>
      Acción
    </button>
  ),
};

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("DataTable responsive", () => {
  it("renders a desktop table by default", () => {
    mockViewport("desktop");
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Row A", detail: "D1", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          aria-label="Tabla demo"
        />
      </MantineProvider>,
    );

    assert.ok(view.getByRole("table", { name: "Tabla demo" }));
    assert.ok(view.getByText("Row A"));
  });

  it("renders mobile cards when mobileView=cards and viewport is below sm", () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Card A", detail: "Phone", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          mobileView="cards"
          mobileCard={mobileCard}
          aria-label="Listado cards"
        />
      </MantineProvider>,
    );

    assert.equal(view.queryByRole("table"), null);
    assert.ok(view.getByRole("list", { name: "Listado cards" }));
    assert.ok(view.getByText("Card A"));
    assert.ok(view.getAllByText("Phone").length >= 1);
  });

  it("uses stable keys via getRowKey (card list items present)", () => {
    mockViewport("mobile");
    const { container } = render(
      <MantineProvider>
        <DataTable
          rows={[
            { id: "id-1", label: "Uno", detail: "A", clickable: true },
            { id: "id-2", label: "Dos", detail: "B", clickable: true },
          ]}
          columns={columns}
          getRowKey={(row) => row.id}
          mobileView="cards"
          mobileCard={mobileCard}
        />
      </MantineProvider>,
    );

    assert.equal(container.querySelectorAll('[role="listitem"]').length, 2);
  });

  it("shows loading, empty and error states without duplicating data views", () => {
    mockViewport("mobile");
    const { rerender, getByText } = render(
      <MantineProvider>
        <DataTable
          rows={[]}
          columns={columns}
          getRowKey={(row) => row.id}
          loading
          mobileView="cards"
          mobileCard={mobileCard}
        />
      </MantineProvider>,
    );
    assert.ok(getByText("Cargando datos..."));

    rerender(
      <MantineProvider>
        <DataTable
          rows={[]}
          columns={columns}
          getRowKey={(row) => row.id}
          emptyTitle="Vacío"
          emptyDescription="Sin filas"
          mobileView="cards"
          mobileCard={mobileCard}
        />
      </MantineProvider>,
    );
    assert.ok(getByText("Vacío"));

    rerender(
      <MantineProvider>
        <DataTable
          rows={[]}
          columns={columns}
          getRowKey={(row) => row.id}
          error="Falló la carga"
          mobileView="cards"
          mobileCard={mobileCard}
        />
      </MantineProvider>,
    );
    assert.ok(getByText("Falló la carga"));
  });

  it("invokes onRowClick from a card and not from an inner action", () => {
    mockViewport("mobile");
    const rowClicks: string[] = [];
    const actionClicks: string[] = [];

    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Card A", detail: "D", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          onRowClick={(row) => rowClicks.push(row.id)}
          mobileView="cards"
          mobileCard={{
            ...mobileCard,
            actions: () => (
              <button type="button" onClick={() => actionClicks.push("x")}>
                Acción
              </button>
            ),
          }}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByText("Acción"));
    assert.deepEqual(actionClicks, ["x"]);
    assert.deepEqual(rowClicks, []);

    fireEvent.click(view.getByText("Card A"));
    assert.deepEqual(rowClicks, ["a"]);
  });

  it("renders summary accordion with expand control", () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Sum A", detail: "Extra", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          mobileView="summary"
          mobileCard={{
            ...mobileCard,
            expandedContent: () => <span>Contenido expandido</span>,
          }}
          aria-label="Resumen"
        />
      </MantineProvider>,
    );

    const control = view.getByRole("button", { name: /Sum A/i });
    assert.equal(control.getAttribute("aria-expanded"), "false");
    fireEvent.click(control);
    assert.ok(view.getByText("Contenido expandido"));
  });

  it("keeps scroll mode as a table on mobile", () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Scroll A", detail: "D", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          mobileView="scroll"
          scrollMinWidth={640}
          aria-label="Tabla scroll"
        />
      </MantineProvider>,
    );

    assert.ok(view.getByRole("table", { name: "Tabla scroll" }));
  });

  it("supports sorting callbacks on desktop headers", () => {
    mockViewport("desktop");
    const sorts: string[] = [];
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Row A", detail: "D", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          sortBy="label"
          sortDirection="asc"
          onSortChange={(key) => sorts.push(key)}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByRole("button", { name: "Ordenar por Label" }));
    assert.deepEqual(sorts, ["label"]);
  });

  it("renders pagination slot for cards and table", () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Card A", detail: "D", clickable: true }]}
          columns={columns}
          getRowKey={(row) => row.id}
          mobileView="cards"
          mobileCard={mobileCard}
          pagination={<div>Paginación</div>}
        />
      </MantineProvider>,
    );
    assert.ok(view.getByText("Paginación"));
  });
});
