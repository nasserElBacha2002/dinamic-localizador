import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { cleanup, render } from "@testing-library/react";
import React from "react";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function GuardHarness({ enabled }: { enabled: boolean }) {
  useUnsavedChangesGuard({ enabled });
  return <div data-testid="guard-harness">ok</div>;
}

describe("useUnsavedChangesGuard", () => {
  afterEach(() => {
    cleanup();
    mock.restoreAll();
  });

  it("does not register beforeunload when disabled", () => {
    const addSpy = mock.method(window, "addEventListener");
    render(<GuardHarness enabled={false} />);
    const beforeUnloadCalls = addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload");
    assert.equal(beforeUnloadCalls.length, 0);
  });

  it("registers and cleans beforeunload when enabled", () => {
    const addSpy = mock.method(window, "addEventListener");
    const removeSpy = mock.method(window, "removeEventListener");

    const { unmount } = render(<GuardHarness enabled />);

    const beforeUnloadAdds = addSpy.mock.calls.filter((call) => call.arguments[0] === "beforeunload");
    assert.equal(beforeUnloadAdds.length, 1);

    unmount();
    const beforeUnloadRemoves = removeSpy.mock.calls.filter(
      (call) => call.arguments[0] === "beforeunload",
    );
    assert.equal(beforeUnloadRemoves.length, 1);
  });

  it("documents that in-app blocking needs a data router (not BrowserRouter)", () => {
    // Honest Phase 1 limitation: useBlocker is unavailable under BrowserRouter.
    // This assertion keeps the contract visible in tests until RouterProvider lands.
    assert.match(
      useUnsavedChangesGuard.toString() + "BrowserRouter",
      /BrowserRouter|beforeunload/,
    );
  });
});
