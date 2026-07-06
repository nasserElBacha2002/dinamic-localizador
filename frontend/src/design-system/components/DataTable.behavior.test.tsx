import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { DataTable } from "./DataTable";

interface SampleRow {
  id: string;
  label: string;
  clickable: boolean;
}

afterEach(() => {
  cleanup();
});

describe("DataTable click behavior", () => {
  it("calls onRowClick only for clickable rows when isRowClickable is provided", () => {
    const clicked: string[] = [];
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[
            { id: "a", label: "Row A", clickable: true },
            { id: "b", label: "Row B", clickable: false },
          ]}
          columns={[{ key: "label", header: "Label", getValue: (row) => row.label }]}
          getRowKey={(row) => row.id}
          onRowClick={(row) => clicked.push(row.id)}
          isRowClickable={(row) => row.clickable}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByText("Row A").closest("tr")!);
    fireEvent.click(view.getByText("Row B").closest("tr")!);
    assert.deepEqual(clicked, ["a"]);
  });

  it("keeps all rows clickable when isRowClickable is omitted", () => {
    const clicked: string[] = [];
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[
            { id: "a", label: "Row A", clickable: true },
            { id: "b", label: "Row B", clickable: false },
          ]}
          columns={[{ key: "label", header: "Label", getValue: (row) => row.label }]}
          getRowKey={(row) => row.id}
          onRowClick={(row) => clicked.push(row.id)}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByText("Row A").closest("tr")!);
    fireEvent.click(view.getByText("Row B").closest("tr")!);
    assert.deepEqual(clicked, ["a", "b"]);
  });

  it("does not trigger row navigation when an action control is clicked", () => {
    const rowClicks: string[] = [];
    const actionClicks: string[] = [];
    const view = render(
      <MantineProvider>
        <DataTable
          rows={[{ id: "a", label: "Row A", clickable: true }]}
          columns={[{ key: "label", header: "Label", getValue: (row) => row.label }]}
          getRowKey={(row) => row.id}
          onRowClick={(row) => rowClicks.push(row.id)}
          rowActions={() => (
            <button type="button" onClick={() => actionClicks.push("action")}>
              Acción
            </button>
          )}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByText("Acción"));
    assert.deepEqual(actionClicks, ["action"]);
    assert.deepEqual(rowClicks, []);
  });
});
