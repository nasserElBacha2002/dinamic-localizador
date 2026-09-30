import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import {
  EntityMultiSelect,
  type EntityMultiSelectOption,
} from "./EntityMultiSelect";

const OPTIONS = [
  { value: "1", label: "Juan Pérez" },
  { value: "2", label: "María López" },
  { value: "3", label: "Pedro Gómez" },
  { value: "4", label: "Ana Ruiz", disabled: true },
];

function stampOptions(
  sourceSearch: string,
  rows: Array<{ value: string; label: string; searchGroupIndex: number; searchGroupKey: string }>,
): EntityMultiSelectOption[] {
  return rows.map((row) => ({ ...row, sourceSearch }));
}

function Harness(props: {
  maxVisibleChips?: number;
  allowCommaSelection?: boolean;
  initialSearch?: string;
  options?: EntityMultiSelectOption[];
}) {
  const [value, setValue] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState(props.initialSearch ?? "");

  return (
    <MantineProvider>
      <EntityMultiSelect
        label="Colaboradores"
        value={value}
        onChange={setValue}
        options={props.options ?? OPTIONS}
        inputValue={inputValue}
        onInputChange={setInputValue}
        maxVisibleChips={props.maxVisibleChips ?? 3}
        allowCommaSelection={props.allowCommaSelection}
        selectionSummaryLabel="colaboradores seleccionados"
      />
      <div data-testid="selected-count">{value.length}</div>
      <div data-testid="input-value">{inputValue}</div>
    </MantineProvider>
  );
}

/**
 * Keeps the original lookup options frozen after the input changes — reproduces
 * the remote `placeholderData` window before the next lookup response arrives.
 */
function StaleOptionsHarness(props: {
  initialSearch: string;
  options: EntityMultiSelectOption[];
}) {
  const [value, setValue] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState(props.initialSearch);
  // Intentionally NOT derived from inputValue: stale until a "refetch" would replace them.
  const [options] = useState(props.options);

  return (
    <MantineProvider>
      <EntityMultiSelect
        label="Colaboradores"
        value={value}
        onChange={setValue}
        options={options}
        inputValue={inputValue}
        onInputChange={setInputValue}
        allowCommaSelection={false}
        selectionSummaryLabel="colaboradores seleccionados"
      />
      <div data-testid="selected-count">{value.length}</div>
      <div data-testid="input-value">{inputValue}</div>
    </MantineProvider>
  );
}

describe("EntityMultiSelect", () => {
  afterEach(() => {
    cleanup();
  });

  it("selects by click and prevents duplicates", () => {
    const view = render(<Harness />);
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByText("Juan Pérez"));
    assert.equal(view.getByTestId("selected-count").textContent, "1");
    assert.ok(view.getByText("Juan Pérez"));

    fireEvent.focus(input);
    assert.equal(view.queryByRole("option", { name: /Juan Pérez/ }), null);
  });

  it("selects with Enter and comma", () => {
    const view = render(<Harness />);
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });
    assert.equal(view.getByTestId("selected-count").textContent, "1");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "," });
    assert.equal(view.getByTestId("selected-count").textContent, "2");

    fireEvent.change(input, { target: { value: "texto" } });
    fireEvent.keyDown(input, { key: "," });
    assert.ok(!(input as HTMLInputElement).value.includes(","));
  });

  it("removes last chip with Backspace when input is empty", () => {
    const view = render(<Harness />);
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByText("Juan Pérez"));
    fireEvent.keyDown(input, { key: "Backspace" });
    assert.equal(view.getByTestId("selected-count").textContent, "0");
  });

  it("collapses chips with +N overflow", () => {
    const view = render(<Harness maxVisibleChips={2} />);
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByText("Juan Pérez"));
    fireEvent.focus(input);
    fireEvent.click(view.getByText("María López"));
    fireEvent.focus(input);
    fireEvent.click(view.getByText("Pedro Gómez"));
    assert.ok(within(view.container).getByText("+1"));
    assert.equal(view.getByTestId("selected-count").textContent, "3");
  });

  it("clears all selected values", () => {
    const view = render(<Harness />);
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByText("Juan Pérez"));
    fireEvent.click(view.getByLabelText("Limpiar selección"));
    assert.equal(view.getByTestId("selected-count").textContent, "0");
  });

  it("clears a single-group search after selecting that person", () => {
    const view = render(
      <Harness
        initialSearch="juan"
        allowCommaSelection={false}
        options={stampOptions("juan", [
          { value: "1", label: "Juan Pérez", searchGroupIndex: 0, searchGroupKey: "juan" },
        ])}
      />,
    );
    fireEvent.focus(view.getByRole("combobox", { name: "Colaboradores" }));
    fireEvent.click(view.getByRole("option", { name: /Juan Pérez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "");
    assert.equal(view.getByTestId("selected-count").textContent, "1");
  });

  it("removes only the middle search group using the stamped association", () => {
    const sourceSearch = "isaac, maría, emp";
    const view = render(
      <Harness
        initialSearch={sourceSearch}
        allowCommaSelection={false}
        options={stampOptions(sourceSearch, [
          { value: "1", label: "Isaac Duarte", searchGroupIndex: 0, searchGroupKey: "isaac" },
          { value: "2", label: "María López", searchGroupIndex: 1, searchGroupKey: "maría" },
          { value: "3", label: "Empleado Demo", searchGroupIndex: 2, searchGroupKey: "emp" },
        ])}
      />,
    );
    fireEvent.focus(view.getByRole("combobox", { name: "Colaboradores" }));
    fireEvent.click(view.getByRole("option", { name: /María López/i }));
    assert.equal(view.getByTestId("input-value").textContent, "isaac, emp");
    assert.equal(view.getByTestId("selected-count").textContent, "1");
  });

  it("consumes remaining groups across successive selections using stable group keys", () => {
    const sourceSearch = "juan, maría, pedro";
    const view = render(
      <StaleOptionsHarness
        initialSearch={sourceSearch}
        options={stampOptions(sourceSearch, [
          { value: "1", label: "Juan Pérez", searchGroupIndex: 0, searchGroupKey: "juan" },
          { value: "2", label: "María López", searchGroupIndex: 1, searchGroupKey: "maría" },
          { value: "3", label: "Pedro Gómez", searchGroupIndex: 2, searchGroupKey: "pedro" },
        ])}
      />,
    );
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /María López/i }));
    assert.equal(view.getByTestId("input-value").textContent, "juan, pedro");

    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /Juan Pérez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "pedro");

    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /Pedro Gómez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "");
    assert.equal(view.getByTestId("selected-count").textContent, "3");
  });

  it("does not consume the wrong group when selecting a stale option after another selection", () => {
    const sourceSearch = "ana, marta, juana";
    const view = render(
      <StaleOptionsHarness
        initialSearch={sourceSearch}
        options={stampOptions(sourceSearch, [
          { value: "1", label: "Ana Perez", searchGroupIndex: 0, searchGroupKey: "ana" },
          { value: "2", label: "Marta Gomez", searchGroupIndex: 1, searchGroupKey: "marta" },
          { value: "3", label: "Juana Diaz", searchGroupIndex: 2, searchGroupKey: "juana" },
        ])}
      />,
    );
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /Ana Perez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "marta, juana");

    // Stale Marta still has groupIndex 1 (which now points at juana if misapplied).
    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /Marta Gomez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "juana");
    assert.equal(view.getByTestId("selected-count").textContent, "2");
  });

  it("preserves pending searches when a stale option only has an out-of-range index", () => {
    const sourceSearch = "ana, marta, juana";
    const view = render(
      <StaleOptionsHarness
        initialSearch={sourceSearch}
        options={[
          {
            value: "1",
            label: "Ana Perez",
            searchGroupIndex: 0,
            searchGroupKey: "ana",
            sourceSearch,
          },
          {
            value: "3",
            label: "Juana Diaz",
            // After Ana is consumed, index 2 is out of range for "marta, juana".
            searchGroupIndex: 2,
            sourceSearch,
          },
        ]}
      />,
    );
    const input = view.getByRole("combobox", { name: "Colaboradores" });
    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /Ana Perez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "marta, juana");

    fireEvent.focus(input);
    fireEvent.click(view.getByRole("option", { name: /Juana Diaz/i }));
    assert.equal(view.getByTestId("input-value").textContent, "marta, juana");
    assert.equal(view.getByTestId("selected-count").textContent, "2");
  });

  it("preserves pending searches when the option has no group association", () => {
    const view = render(
      <Harness
        initialSearch="isaac, cintia, emp"
        allowCommaSelection={false}
        options={[{ value: "2", label: "Cintia David" }]}
      />,
    );
    fireEvent.focus(view.getByRole("combobox", { name: "Colaboradores" }));
    fireEvent.click(view.getByRole("option", { name: /Cintia David/i }));
    assert.equal(view.getByTestId("input-value").textContent, "isaac, cintia, emp");
    assert.equal(view.getByTestId("selected-count").textContent, "1");
  });

  it("does not restore consumed search text when a chip is removed", () => {
    const sourceSearch = "juan, maría";
    const view = render(
      <Harness
        initialSearch={sourceSearch}
        allowCommaSelection={false}
        options={stampOptions(sourceSearch, [
          { value: "1", label: "Juan Pérez", searchGroupIndex: 0, searchGroupKey: "juan" },
          { value: "2", label: "María López", searchGroupIndex: 1, searchGroupKey: "maría" },
        ])}
      />,
    );
    fireEvent.focus(view.getByRole("combobox", { name: "Colaboradores" }));
    fireEvent.click(view.getByRole("option", { name: /Juan Pérez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "maría");

    fireEvent.click(view.getByLabelText("Quitar Juan Pérez"));
    assert.equal(view.getByTestId("selected-count").textContent, "0");
    assert.equal(view.getByTestId("input-value").textContent, "maría");
  });

  it("syncs typed search when the parent clears inputValue externally", () => {
    function ExternalClearHarness() {
      const [value, setValue] = useState<string[]>([]);
      const [inputValue, setInputValue] = useState("juan, maría");
      return (
        <MantineProvider>
          <button type="button" onClick={() => setInputValue("")}>
            clear-search
          </button>
          <EntityMultiSelect
            label="Colaboradores"
            value={value}
            onChange={setValue}
            options={stampOptions("juan, maría", [
              { value: "1", label: "Juan Pérez", searchGroupIndex: 0, searchGroupKey: "juan" },
              { value: "2", label: "María López", searchGroupIndex: 1, searchGroupKey: "maría" },
            ])}
            inputValue={inputValue}
            onInputChange={setInputValue}
            allowCommaSelection={false}
          />
          <div data-testid="input-value">{inputValue}</div>
        </MantineProvider>
      );
    }

    const view = render(<ExternalClearHarness />);
    fireEvent.click(view.getByRole("button", { name: "clear-search" }));
    assert.equal(view.getByTestId("input-value").textContent, "");
    fireEvent.focus(view.getByRole("combobox", { name: "Colaboradores" }));
    fireEvent.click(view.getByRole("option", { name: /Juan Pérez/i }));
    assert.equal(view.getByTestId("input-value").textContent, "");
  });
});
