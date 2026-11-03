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

  it("does not create a scroll body region in normal mode without footer on desktop", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="Normal" bodyMode="normal">
          <p>Sin scroll anidado</p>
        </ResponsiveModal>
      </MantineProvider>,
    );
    assert.equal(document.querySelector("[data-testid='responsive-modal-scroll-body']"), null);
  });

  it("uses a scroll body when footer actions are pinned on desktop", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal
          opened
          onClose={() => undefined}
          title="Con footer"
          bodyMode="normal"
          footer={<Button>Guardar</Button>}
        >
          <p>Contenido</p>
        </ResponsiveModal>
      </MantineProvider>,
    );
    assert.ok(document.querySelector("[data-testid='responsive-modal-scroll-body']"));
    assert.ok(document.querySelector("[data-testid='responsive-modal-footer']"));
  });

  it("merges custom modal styles without dropping bounded scroll layout", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal
          opened
          onClose={() => undefined}
          title="Settings shell"
          bodyMode="scroll"
          footer={<Button>Guardar</Button>}
          styles={{
            header: { borderBottom: "1px solid red" },
            body: { paddingTop: "12px", overflow: "visible", minHeight: 400 },
            content: { overflow: "visible", maxHeight: "none" },
          }}
        >
          <div style={{ height: 800 }}>Largo</div>
        </ResponsiveModal>
      </MantineProvider>,
    );

    const dialogContent = document.querySelector(".mantine-Modal-content") as HTMLElement | null;
    assert.ok(dialogContent);
    assert.match(dialogContent.style.overflow, /hidden/);
    assert.match(dialogContent.style.maxHeight, /min\(90dvh/);

    const modalBody = document.querySelector(".mantine-Modal-body") as HTMLElement | null;
    assert.ok(modalBody);
    assert.equal(modalBody.style.paddingTop, "12px");
    assert.match(modalBody.style.overflow, /hidden/);

    const scrollBody = document.querySelector(
      "[data-testid='responsive-modal-scroll-body']",
    ) as HTMLElement | null;
    assert.ok(scrollBody);
    assert.match(scrollBody.style.overflowY, /auto|scroll/);
  });

  it("uses native Mantine content scroll for long md dialogs without a pinned footer", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="Md largo" bodyMode="normal" size="md">
          <div style={{ height: 1200 }} data-testid="long-md-content">
            Contenido extenso md
          </div>
        </ResponsiveModal>
      </MantineProvider>,
    );

    assert.equal(document.querySelector("[data-testid='responsive-modal-scroll-body']"), null);
    const dialogContent = document.querySelector(".mantine-Modal-content") as HTMLElement | null;
    assert.ok(dialogContent);
    assert.match(dialogContent.style.overflowY, /auto|scroll/);
    assert.match(dialogContent.style.maxHeight, /min\(90dvh/);
    assert.ok(document.body.textContent?.includes("Contenido extenso md"));
  });

  it("does not cap modal content width on mobile fullscreen", () => {
    mockViewport("mobile");
    render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="Mobile" size="md">
          <div>Contenido mobile</div>
        </ResponsiveModal>
      </MantineProvider>,
    );

    const dialogContent = document.querySelector(".mantine-Modal-content") as HTMLElement | null;
    assert.ok(dialogContent);
    assert.ok(document.querySelector("[data-fullscreen='true']"));
    assert.notEqual(dialogContent.style.maxWidth, `min(100%, ${"calc(100vw - 2rem)"})`);
    assert.equal(dialogContent.style.maxWidth, "");
  });

  it("widens lg and xl only through ResponsiveModal desktop size mapping", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal opened onClose={() => undefined} title="XL" size="xl">
          <p>Ancho xl</p>
        </ResponsiveModal>
      </MantineProvider>,
    );

    const dialogRoot = document.querySelector(".mantine-Modal-root") as HTMLElement | null;
    assert.ok(dialogRoot);
    const modalSize = dialogRoot.style.getPropertyValue("--modal-size");
    assert.match(modalSize, /920px|57\.5rem/);
  });

  it("keeps a bounded overflow scroll body with sticky footer when bodyMode=scroll", () => {
    mockViewport("desktop");
    render(
      <MantineProvider>
        <ResponsiveModal
          opened
          onClose={() => undefined}
          title="Largo"
          bodyMode="scroll"
          footer={<Button>OK</Button>}
          footerBanner={<p>Banner fijo</p>}
        >
          <div style={{ height: 1200 }}>Contenido extenso</div>
        </ResponsiveModal>
      </MantineProvider>,
    );
    const scrollBody = document.querySelector(
      "[data-testid='responsive-modal-scroll-body']",
    ) as HTMLElement | null;
    assert.ok(scrollBody);
    assert.match(scrollBody.style.overflowY, /auto|scroll/);
    assert.match(scrollBody.style.flex, /1 1 0/);
    assert.ok(document.querySelector("[data-testid='responsive-modal-footer']"));
    assert.ok(document.querySelector("[data-testid='responsive-modal-footer-banner']"));
    assert.ok(document.body.textContent?.includes("Contenido extenso"));
    assert.ok(document.body.textContent?.includes("Banner fijo"));
  });
});
