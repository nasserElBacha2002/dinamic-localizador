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
import { EntityMultiSelect } from "./EntityMultiSelect";

const OPTIONS = [
  { value: "1", label: "Juan Pérez" },
  { value: "2", label: "María López" },
  { value: "3", label: "Pedro Gómez" },
  { value: "4", label: "Ana Ruiz", disabled: true },
];

function Harness(props: { maxVisibleChips?: number }) {
  const [value, setValue] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  return (
    <MantineProvider>
      <EntityMultiSelect
        label="Colaboradores"
        value={value}
        onChange={setValue}
        options={OPTIONS}
        inputValue={inputValue}
        onInputChange={setInputValue}
        maxVisibleChips={props.maxVisibleChips ?? 3}
        selectionSummaryLabel="colaboradores seleccionados"
      />
      <div data-testid="selected-count">{value.length}</div>
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
});
