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
          bodyMode="normal"
          footer={<Button onClick={() => undefined}>Guardar</Button>}
        >
          <p>Contenido corto</p>
        </ResponsiveModal>
      </MantineProvider>,
    );

    assert.ok(view.getByRole("dialog"));
    assert.ok(view.getByText("Título desktop"));
    assert.ok(view.getByText("Contenido corto"));
    assert.ok(view.getByRole("button", { name: "Guardar" }));
    assert.equal(document.querySelector("[data-fullscreen='true']"), null);

    fireEvent.click(view.getByRole("button", { name: "Cerrar" }));
    assert.equal(closed, 1);
  });

  it("becomes fullscreen below sm", () => {
    mockViewport("mobile");
    render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="Título mobile" size="md">
          <div>Scroll body</div>
        </ResponsiveModal>
      </MantineProvider>,
    );

    assert.ok(document.querySelector("[data-fullscreen='true']"));
    assert.ok(document.body.textContent?.includes("Scroll body"));
  });

  it("uses scroll body mode without forcing ScrollArea for normal mode", () => {
    mockViewport("desktop");
    const { container } = render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="Normal" bodyMode="normal">
          <p>Sin scroll anidado</p>
        </ResponsiveModal>
      </MantineProvider>,
    );
    assert.equal(container.querySelector(".mantine-ScrollArea-root"), null);
  });

  it("wraps long content with ScrollArea when bodyMode=scroll", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal
          opened
          onClose={() => undefined}
          title="Largo"
          bodyMode="scroll"
          footer={<Button>OK</Button>}
        >
          <div style={{ height: 1200 }}>Contenido extenso</div>
        </ResponsiveModal>
      </MantineProvider>,
    );
    assert.ok(document.querySelector(".mantine-ScrollArea-root"));
    assert.ok(document.body.textContent?.includes("Contenido extenso"));
  });
});
