import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { cleanup, fireEvent, render, act } from "@testing-library/react";
import React, { useState } from "react";
import { useUnsavedChangesController } from "./useUnsavedChangesController";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function GuardHarness({ enabled }: { enabled: boolean }) {
  useUnsavedChangesGuard({ enabled, message: "custom-leave" });
  return <div>ok</div>;
}

function ControllerHarness() {
  const unsaved = useUnsavedChangesController({ active: true });
  const [location, setLocation] = useState("edit");

  return (
    <div>
      <div data-testid="location">{location}</div>
      <div data-testid="dialog">{unsaved.discardDialogOpen ? "open" : "closed"}</div>
      <div data-testid="armed">{unsaved.isArmed ? "yes" : "no"}</div>
      <button type="button" onClick={() => setLocation("edit")}>
        go-edit
      </button>
      <button type="button" onClick={() => unsaved.setDirty(true)}>
        dirty
      </button>
      <button
        type="button"
        onClick={() => {
          unsaved.setSubmitting(true);
          unsaved.markClean();
          setLocation("detail");
          unsaved.setSubmitting(false);
        }}
      >
        submit-success
      </button>
      <button
        type="button"
        onClick={() => {
          unsaved.setSubmitting(true);
          unsaved.setSubmitting(false);
        }}
      >
        submit-error
      </button>
      <button type="button" onClick={() => unsaved.requestNavigation(() => setLocation("detail"))}>
        cancel
      </button>
      <button type="button" onClick={unsaved.confirmDiscard}>
        confirm-discard
      </button>
      <button type="button" onClick={unsaved.cancelDiscard}>
        cancel-discard
      </button>
    </div>
  );
}

describe("useUnsavedChangesGuard", () => {
  afterEach(() => {
    cleanup();
    mock.restoreAll();
  });

  it("does not register beforeunload when disabled", () => {
    const addSpy = mock.method(window, "addEventListener");
    render(<GuardHarness enabled={false} />);
    assert.equal(addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length, 0);
  });

  it("registers beforeunload, sets returnValue, and removes the same handler", () => {
    const addSpy = mock.method(window, "addEventListener");
    const removeSpy = mock.method(window, "removeEventListener");
    const { unmount } = render(<GuardHarness enabled />);

    const addCalls = addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload");
    assert.equal(addCalls.length, 1);
    const handler = addCalls[0]?.arguments[1] as (event: BeforeUnloadEvent) => void;
    const event = { preventDefault() {}, returnValue: "" } as BeforeUnloadEvent;
    handler(event);
    assert.equal(event.returnValue, "custom-leave");

    unmount();
    const removeCalls = removeSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload");
    assert.equal(removeCalls.length, 1);
    assert.equal(removeCalls[0]?.arguments[1], handler);
  });

  it("reacts to enabled changes without leaving duplicate listeners", () => {
    const addSpy = mock.method(window, "addEventListener");
    const removeSpy = mock.method(window, "removeEventListener");
    const { rerender, unmount } = render(<GuardHarness enabled={false} />);
    assert.equal(addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length, 0);

    rerender(<GuardHarness enabled />);
    assert.equal(addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length, 1);

    rerender(<GuardHarness enabled={false} />);
    assert.equal(
      removeSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length,
      1,
    );

    rerender(<GuardHarness enabled />);
    assert.equal(addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length, 2);

    unmount();
  });
});

describe("useUnsavedChangesController", () => {
  afterEach(() => {
    cleanup();
  });

  it("navigates immediately when clean", () => {
    const view = render(<ControllerHarness />);
    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    assert.equal(view.getByTestId("location").textContent, "detail");
    assert.equal(view.getByTestId("dialog").textContent, "closed");
  });

  it("keeps edits when discard is cancelled and navigates when confirmed", () => {
    const view = render(<ControllerHarness />);
    fireEvent.click(view.getByRole("button", { name: "dirty" }));
    assert.equal(view.getByTestId("armed").textContent, "yes");

    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    assert.equal(view.getByTestId("location").textContent, "edit");
    assert.equal(view.getByTestId("dialog").textContent, "open");

    fireEvent.click(view.getByRole("button", { name: "cancel-discard" }));
    assert.equal(view.getByTestId("location").textContent, "edit");
    assert.equal(view.getByTestId("dialog").textContent, "closed");

    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    fireEvent.click(view.getByRole("button", { name: "confirm-discard" }));
    assert.equal(view.getByTestId("location").textContent, "detail");
    assert.equal(view.getByTestId("dialog").textContent, "closed");
    assert.equal(view.getByTestId("armed").textContent, "no");
  });

  it("does not prompt after successful submit clears dirty", () => {
    const view = render(<ControllerHarness />);
    fireEvent.click(view.getByRole("button", { name: "dirty" }));
    fireEvent.click(view.getByRole("button", { name: "submit-success" }));
    assert.equal(view.getByTestId("location").textContent, "detail");
    assert.equal(view.getByTestId("armed").textContent, "no");

    fireEvent.click(view.getByRole("button", { name: "go-edit" }));
    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    assert.equal(view.getByTestId("location").textContent, "detail");
    assert.equal(view.getByTestId("dialog").textContent, "closed");
  });

  it("keeps dirty protection after submit error", () => {
    const view = render(<ControllerHarness />);
    fireEvent.click(view.getByRole("button", { name: "dirty" }));
    fireEvent.click(view.getByRole("button", { name: "submit-error" }));
    assert.equal(view.getByTestId("armed").textContent, "yes");
    fireEvent.click(view.getByRole("button", { name: "cancel" }));
    assert.equal(view.getByTestId("location").textContent, "edit");
    assert.equal(view.getByTestId("dialog").textContent, "open");
  });

  it("arms beforeunload only while dirty and not submitting", () => {
    const addSpy = mock.method(window, "addEventListener");
    const view = render(<ControllerHarness />);
    assert.equal(addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length, 0);

    act(() => {
      fireEvent.click(view.getByRole("button", { name: "dirty" }));
    });
    assert.equal(addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload").length, 1);
  });
});
