import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import { FilterLookupInput } from "./FilterLookupInput";

function Harness() {
  const [value, setValue] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("Audit");
  const [created, setCreated] = useState(false);

  return (
    <MantineProvider>
      <FilterLookupInput
        label="Categoría"
        value={value}
        onChange={setValue}
        inputValue={inputValue}
        onInputChange={setInputValue}
        options={[
          { value: "cat-1", label: "Auditor" },
          { value: "cat-2", label: "Auxiliar" },
        ]}
        createOption={{
          label: '+ Crear categoría “Audit”',
          onSelect: () => setCreated(true),
        }}
      />
      {created ? <div>create-selected</div> : null}
    </MantineProvider>
  );
}

describe("FilterLookupInput create with partial matches", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps partial matches and still offers create option", () => {
    const view = render(<Harness />);

    const input = view.getByLabelText("Categoría");
    fireEvent.focus(input);
    fireEvent.click(input);

    assert.ok(view.getByText("Auditor"));
    assert.ok(view.getByText(/Crear categoría “Audit”/));

    fireEvent.click(view.getByText(/Crear categoría “Audit”/));
    assert.ok(view.getByText("create-selected"));
  });
});
