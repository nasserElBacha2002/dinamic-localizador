import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { Button, MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { mockViewport } from "../../test/mock-match-media";
import { ResponsiveModal } from "./ResponsiveModal";

afterEach(() => {
  cleanup();
  mockViewport("desktop");
});

describe("ResponsiveModal", () => {
  it("renders a normal dialog on desktop with title, body and footer", () => {
    mockViewport("desktop");
    let closed = 0;
    const view = render(
      <MantineProvider>
        <ResponsiveModal
          opened
          onClose={() => {
            closed += 1;
          }}
          title="Título desktop"
          footer={<Button onClick={() => undefined}>Guardar</Button>}
        >
          <p>Contenido largo</p>
        </ResponsiveModal>
      </MantineProvider>,
    );

    assert.ok(view.getByRole("dialog"));
    assert.ok(view.getByText("Título desktop"));
    assert.ok(view.getByText("Contenido largo"));
    assert.ok(view.getByRole("button", { name: "Guardar" }));

    fireEvent.click(view.getByRole("button", { name: "Cerrar" }));
    assert.equal(closed, 1);
  });

  it("renders fullscreen-capable dialog below sm", () => {
    mockViewport("mobile");
    const view = render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="Título mobile" size="md">
          <div>Scroll body</div>
        </ResponsiveModal>
      </MantineProvider>,
    );

    assert.ok(view.getByRole("dialog"));
    assert.ok(view.getByText("Título mobile"));
    assert.ok(view.getByText("Scroll body"));
    assert.ok(document.querySelector(".mantine-Modal-content"));
  });
});
