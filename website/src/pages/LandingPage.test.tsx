import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installMobileMatchMedia } from "../test/match-media-mobile";

let renderPage: typeof import("../test/render-page").renderPage;
let LandingPage: React.ComponentType;

before(async () => {
  ({ renderPage } = await import("../test/render-page"));
  ({ LandingPage } = await import("./LandingPage"));
});

afterEach(() => {
  cleanup();
});

describe("LandingPage", () => {
  it("renderiza hero, CTA de demo y secciones clave", () => {
    const { getByRole, getAllByRole } = renderPage(<LandingPage />);

    assert.ok(getByRole("heading", { level: 1, name: /Tu operación, bajo control/i }));
    assert.ok(getAllByRole("link", { name: /Solicitar/i }).length >= 1);
    assert.ok(getByRole("heading", { level: 2, name: /PLANIFICÁ\s+DETECTÁ\s+RESOLVÉ/i }));
  });

  it("hero usa copy operativo sin pilares repetidos ni CTAs duplicados", () => {
    const { getByRole, getByText, queryByText, queryByRole } = renderPage(<LandingPage />);
    const heroTitle = getByRole("heading", { level: 1, name: /Tu operación, bajo control/i });
    const heroCopy = heroTitle.parentElement;
    assert.ok(heroCopy);
    assert.ok(getByText(/Coordiná servicios, equipos y alertas desde un solo lugar/i));
    assert.equal(queryByText(/Mirá Dinamic en acción/i), null);
    const copyText = heroCopy.textContent ?? "";
    assert.equal(/PLANIFICÁ\s*·\s*DETECTÁ\s*·\s*RESOLVÉ/i.test(copyText), false);
    assert.equal(queryByRole("button", { name: "Ver cómo funciona" }), null);
    assert.equal(heroCopy.querySelector('a[href="#solicitar-demo"]'), null);
  });

  it("enlaza Ingresar hacia /login (mismo dominio)", () => {
    const { getAllByRole } = renderPage(<LandingPage />);
    const logins = getAllByRole("link", { name: "Ingresar" });
    assert.ok(logins.length >= 1);
    assert.ok(logins.every((link) => link.getAttribute("href") === "/login"));
  });

  it("video usa id unico como-funciona en la seccion", () => {
    const { container } = renderPage(<LandingPage />);
    const section = container.querySelector("#como-funciona");
    assert.ok(section);
    assert.equal(section?.tagName.toLowerCase(), "section");
    assert.equal(container.querySelectorAll("#como-funciona").length, 1);
    assert.ok(container.querySelector("#video-title"));
  });

  it("muestra la grilla de situaciones reales sin carrusel", () => {
    const { getByRole, queryByRole, container } = renderPage(<LandingPage />);

    assert.ok(getByRole("heading", { name: /Situaciones reales/i }));
    assert.ok(getByRole("heading", { level: 3, name: /Faltó una persona/i }));
    assert.ok(getByRole("heading", { level: 3, name: /Armá el equipo de mañana/i }));
    assert.ok(getByRole("heading", { level: 3, name: /¿Arrancaron todos los servicios\?/i }));
    assert.ok(getByRole("heading", { level: 3, name: /Mover a alguien sin otro problema/i }));
    const situationsSection = container.querySelector("#situaciones");
    assert.equal(situationsSection?.querySelectorAll("article").length, 4);
    assert.equal(queryByRole("button", { name: "Siguiente" }), null);
  });

  it("whatsapp expone identidad y estado inicial del fichaje", async () => {
    const { getByTestId } = renderPage(<LandingPage />);

    assert.ok(getByTestId("whatsapp-section"));
    assert.ok(getByTestId("whatsapp-phone"));
    assert.equal(getByTestId("whatsapp-device-stage").getAttribute("data-synced"), "false");
    await waitFor(
      () => {
        assert.ok(getByTestId("whatsapp-assignment"));
      },
      { timeout: 5000 },
    );
  });

  it("registra llegada con ubicación en el flujo WhatsApp simple", async () => {
    const { getByRole, getByTestId } = renderPage(<LandingPage />);

    await waitFor(
      () => {
        assert.ok(getByRole("button", { name: "Compartir ubicación" }));
      },
      { timeout: 5000 },
    );
    fireEvent.click(getByRole("button", { name: "Compartir ubicación" }));
    await waitFor(
      () => {
        assert.equal(getByTestId("whatsapp-device-stage").getAttribute("data-synced"), "true");
        assert.ok(getByTestId("whatsapp-location-share"));
        assert.match(getByTestId("whatsapp-phone").textContent ?? "", /llegada fue registrada/i);
      },
      { timeout: 5000 },
    );
  });

  it("hero expone roadmap de caos operativo", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const roadmap = getByTestId("chaos-roadmap");
    assert.equal(roadmap.getAttribute("data-reduced"), "false");
    assert.equal(roadmap.getAttribute("data-in-view"), "true");
  });

  it("hero mantiene altura del roadmap al togglear animación", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const roadmap = getByTestId("chaos-roadmap");
    const heightBefore = roadmap.getBoundingClientRect().height;
    roadmap.setAttribute("data-animate", "true");
    roadmap.setAttribute("data-animate", "false");
    const heightAfter = roadmap.getBoundingClientRect().height;
    assert.equal(Math.round(heightBefore), Math.round(heightAfter));
  });

  it("video usa headline Planificá Detectá Resolvé con bajada", () => {
    const { getByRole, container } = renderPage(<LandingPage />);
    const section = container.querySelector("#como-funciona");
    assert.ok(section);
    assert.ok(getByRole("heading", { level: 2, name: /PLANIFICÁ\s+DETECTÁ\s+RESOLVÉ/i }));
    assert.match(section.textContent ?? "", /Mirá cómo Dinamic Operations convierte/i);
    assert.equal(container.querySelectorAll('[data-testid="product-flow-divider"]').length, 0);
  });

  it("no muestra éxito falso en el formulario demo", () => {
    const { getByRole, getByText, queryByText } = renderPage(<LandingPage />);
    const submit = getByRole("button", { name: "Solicitar una demo" });
    assert.equal(submit.hasAttribute("disabled"), true);
    assert.ok(getByText(/Solicitudes online próximamente/i));
    assert.equal(queryByText(/backend/i), null);
    assert.equal(queryByText(/endpoint/i), null);
    assert.equal(queryByText(/Recibimos tu solicitud/i), null);
  });

  it("renderiza el roadmap de caos operativo", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const roadmap = getByTestId("chaos-roadmap");
    assert.ok(roadmap.textContent?.includes("WhatsApp"));
    assert.equal(roadmap.getAttribute("data-reduced"), "false");
  });

  it("no renderiza secciones duplicadas eliminadas", () => {
    const { queryByText } = renderPage(<LandingPage />);
    assert.equal(queryByText(/Toda tu operación\. Una sola vista\./i), null);
  });

  it("no muestra las secciones independientes de problema y audiencia", () => {
    const { queryByRole, queryByText } = renderPage(<LandingPage />);
    assert.equal(queryByRole("heading", { name: /Coordinar no debería sentirse así/i }), null);
    assert.equal(queryByText(/Chats\. Llamadas\. Planillas\./i), null);
    assert.equal(queryByText(/^Para quién$/i), null);
  });

  it("incorpora textos de audiencia y CTA final en la sección de demo", () => {
    const { getByRole, getByText } = renderPage(<LandingPage />);
    assert.ok(getByRole("heading", { name: /Menos tiempo coordinando/i }));
    assert.ok(getByText(/Hecho para operaciones que no pasan en una sola oficina/i));
    assert.ok(getByText(/^Limpieza$/i));
    assert.ok(getByText(/^Facility$/i));
    assert.ok(getByText(/Servicios tercerizados/i));
  });

  it("muestra resumen ejecutivo de operación con métricas demo", () => {
    const { getByRole, getByTestId } = renderPage(<LandingPage />);
    const section = getByTestId("operations-summary-section");
    assert.ok(getByRole("heading", { name: /Toda la operación, en una sola vista/i }));
    assert.match(section.textContent ?? "", /Entendé el estado de tu operación de un vistazo/i);
    assert.match(section.textContent ?? "", /Servicios hoy/i);
    assert.match(section.textContent ?? "", /Cobertura/i);
    assert.match(section.textContent ?? "", /Presentismo/i);
    assert.match(section.textContent ?? "", /Llegadas tarde/i);
    assert.match(section.textContent ?? "", /Reporte del día/i);
    assert.equal(section.textContent?.match(/Ausencia detectada/gi)?.length ?? 0, 0);
  });

  it("en viewport mobile muestra carrusel de situaciones con controles", () => {
    const restoreMatchMedia = installMobileMatchMedia();
    cleanup();
    const { getByTestId, getByRole } = renderPage(<LandingPage />);
    assert.ok(getByTestId("situations-mobile-carousel"));
    assert.ok(getByRole("button", { name: "Siguiente" }));
    assert.equal(
      getByTestId("situations-mobile-carousel").querySelectorAll("article").length,
      4,
    );
    restoreMatchMedia();
  });

  it("en viewport mobile muestra WhatsApp compacto sin panel Operations debajo", async () => {
    const restoreMatchMedia = installMobileMatchMedia();
    cleanup();
    const { getByTestId, getByRole, queryByTestId } = renderPage(<LandingPage />);
    assert.equal(getByTestId("whatsapp-section").getAttribute("data-mobile-layout"), "compact");
    assert.equal(queryByTestId("whatsapp-ops-compact"), null);
    assert.ok(getByTestId("whatsapp-phone"));
    await waitFor(
      () => {
        assert.ok(getByRole("button", { name: "Compartir ubicación" }));
      },
      { timeout: 5000 },
    );
    restoreMatchMedia();
  });

  it("en viewport mobile muestra carrusel del resumen de operación", () => {
    const restoreMatchMedia = installMobileMatchMedia();
    cleanup();
    const { getByTestId } = renderPage(<LandingPage />);
    const section = getByTestId("operations-summary-section");
    assert.ok(getByTestId("ops-summary-mobile-carousel"));
    assert.match(section.textContent ?? "", /Servicios hoy/i);
    assert.match(section.textContent ?? "", /Reporte del día/i);
    restoreMatchMedia();
  });

  it("expone bandas CTA intermedias con destinos correctos", () => {
    const { getByTestId } = renderPage(<LandingPage />);

    const postVideo = getByTestId("cta-post-video");
    assert.ok(postVideo.querySelector('a[href="#solicitar-demo"]'));
    assert.ok(postVideo.querySelector('a[href="#situaciones"]'));

    const postSituations = getByTestId("cta-post-situations");
    assert.ok(postSituations.querySelector('a[href="#solicitar-demo"]'));
    assert.ok(postSituations.querySelector('a[href="#como-funciona"]'));

    const postAnalytics = getByTestId("cta-post-analytics");
    assert.ok(postAnalytics.querySelector('a[href="#como-funciona"]'));
  });

  it("navbar muestra lockup de marca final", () => {
    const { getByLabelText } = renderPage(<LandingPage />);
    const logo = getByLabelText("Dinamic Operations");
    assert.ok(logo.querySelector('img[src="/brand/dinamic-operations-logo.svg"]'));
  });

  it("navbar y footer mantienen Ingresar y solicitar demo", () => {
    const { getAllByRole } = renderPage(<LandingPage />);
    const logins = getAllByRole("link", { name: "Ingresar" });
    assert.ok(logins.every((link) => link.getAttribute("href") === "/login"));
    const demoLinks = getAllByRole("link", { name: /Solicitar una demo/i });
    assert.ok(demoLinks.length >= 2);
    assert.ok(demoLinks.some((link) => link.getAttribute("href") === "#solicitar-demo"));
    assert.ok(getAllByRole("link", { name: "Cómo funciona" }).length >= 1);
    assert.ok(getAllByRole("link", { name: "Situaciones" }).length >= 1);
  });

  it("coloca operación de hoy inmediatamente antes del formulario demo", () => {
    const { container } = renderPage(<LandingPage />);
    const operationsTitle = container.querySelector("#operations-today-title");
    const demo = container.querySelector("#solicitar-demo");
    assert.ok(operationsTitle && demo);
    const position = operationsTitle.compareDocumentPosition(demo);
    assert.ok(position & Node.DOCUMENT_POSITION_FOLLOWING);
    const demoParent = demo.parentElement;
    const opsSection = operationsTitle.closest("section");
    assert.ok(opsSection && demoParent);
    let between = false;
    let node: Element | null = opsSection.nextElementSibling;
    while (node) {
      if (node === demo) {
        between = true;
        break;
      }
      node = node.nextElementSibling;
    }
    assert.equal(between, true);
  });
});
