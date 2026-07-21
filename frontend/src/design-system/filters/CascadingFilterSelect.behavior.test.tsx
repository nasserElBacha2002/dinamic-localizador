import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, it } from "node:test";
import React, { useState } from "react";
import {
  resolveCascadeParentChange,
  type CascadingFilterChange,
} from "./cascading-filter-change";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  setupDomEnvironment();
});

/**
 * Native harness mirroring CascadingFilterSelect cascade wiring without Mantine Combobox
 * (happy-dom lacks full ShadowRoot support required by Mantine Select).
 */
function CascadingNativeHarness({
  onCascade,
}: {
  onCascade: (change: CascadingFilterChange) => void;
}) {
  const [parentValue, setParentValue] = useState("");
  const [childValue, setChildValue] = useState("");
  const childDisabled = !parentValue;

  return (
    <div>
      <label>
        Localidad
        <select
          aria-label="Localidad"
          value={parentValue}
          onChange={(event) => {
            const change = resolveCascadeParentChange(parentValue, event.target.value);
            if (!change) {
              return;
            }
            onCascade(change);
            setParentValue(change.parentValue);
            setChildValue(change.childValue);
          }}
        >
          <option value="">Todas</option>
          <option value="CABA">CABA</option>
          <option value="GBA">GBA</option>
        </select>
      </label>
      <label>
        Barrio
        <select
          aria-label="Barrio"
          value={childValue}
          disabled={childDisabled}
          onChange={(event) => setChildValue(event.target.value)}
        >
          <option value="">Todos</option>
          <option value="Palermo">Palermo</option>
        </select>
      </label>
    </div>
  );
}

describe("CascadingFilterSelect behavior (native harness)", () => {
  it("disables child without parent and emits one cascade clearing child", () => {
    const changes: CascadingFilterChange[] = [];
    const view = render(<CascadingNativeHarness onCascade={(change) => changes.push(change)} />);

    assert.equal((view.getByLabelText("Barrio") as HTMLSelectElement).disabled, true);

    fireEvent.change(view.getByLabelText("Localidad"), { target: { value: "CABA" } });
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], { parentValue: "CABA", childValue: "" });
    assert.equal((view.getByLabelText("Barrio") as HTMLSelectElement).disabled, false);
  });

  it("does not emit when selecting the same parent", () => {
    const changes: CascadingFilterChange[] = [];
    const view = render(<CascadingNativeHarness onCascade={(change) => changes.push(change)} />);

    fireEvent.change(view.getByLabelText("Localidad"), { target: { value: "CABA" } });
    fireEvent.change(view.getByLabelText("Localidad"), { target: { value: "CABA" } });
    assert.equal(changes.length, 1);
  });

  it("clears child when parent is cleared", () => {
    const changes: CascadingFilterChange[] = [];
    const view = render(<CascadingNativeHarness onCascade={(change) => changes.push(change)} />);

    fireEvent.change(view.getByLabelText("Localidad"), { target: { value: "CABA" } });
    fireEvent.change(view.getByLabelText("Barrio"), { target: { value: "Palermo" } });
    fireEvent.change(view.getByLabelText("Localidad"), { target: { value: "" } });

    assert.equal(changes.length, 2);
    assert.deepEqual(changes[1], { parentValue: "", childValue: "" });
    assert.equal((view.getByLabelText("Barrio") as HTMLSelectElement).value, "");
  });
});
