import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { getOperationsLoginUrl } from "../config/operations-app-url";

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
    assert.ok(getByRole("heading", { name: /Mirá Dinamic en acción/i }));
    assert.ok(getByRole("heading", { name: /Planificá · Detectá · Resolvé/i }));
  });

  it("enlaza Ingresar hacia OPERATIONS_APP_URL/login", () => {
    const { getByRole } = renderPage(<LandingPage />);
    const login = getByRole("link", { name: "Ingresar" });
    assert.equal(login.getAttribute("href"), getOperationsLoginUrl());
  });

  it("video usa id unico como-funciona en la seccion", () => {
    const { container } = renderPage(<LandingPage />);
    const section = container.querySelector("#como-funciona");
    assert.ok(section);
    assert.equal(section?.tagName.toLowerCase(), "section");
    assert.equal(container.querySelectorAll("#como-funciona").length, 1);
    assert.ok(container.querySelector("#video-title"));
  });

  it("navega el carrusel de situaciones", async () => {
    const { getByRole } = renderPage(<LandingPage />);

    fireEvent.click(getByRole("button", { name: "Siguiente" }));
    await waitFor(() => {
      assert.ok(getByRole("heading", { level: 3, name: /Armá el equipo de mañana/i }));
    });
  });

  it("confirma asistencia en el flujo WhatsApp simple", async () => {
    const { getByRole, getByTestId } = renderPage(<LandingPage />);

    fireEvent.click(getByRole("button", { name: "Confirmar" }));
    await waitFor(() => {
      assert.match(getByTestId("ops-confirm-metric").textContent, /5\/5/);
      assert.match(getByTestId("ops-service-row").textContent, /Cubierto/i);
    });
  });

  it("hero expone escena operativa estable por defecto", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const visual = getByTestId("hero-visual");
    assert.equal(visual.getAttribute("data-phase"), "normal");
    assert.equal(visual.getAttribute("aria-hidden"), "true");
  });

  it("hero mantiene altura exterior al cambiar fase", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const visual = getByTestId("hero-visual");
    const heightBefore = visual.getBoundingClientRect().height;
    visual.setAttribute("data-phase", "error");
    visual.setAttribute("data-phase", "covered");
    const heightAfter = visual.getBoundingClientRect().height;
    assert.equal(Math.round(heightBefore), Math.round(heightAfter));
  });

  it("product experience renderiza y navega cinco fases", () => {
    const { getByTestId, getByRole } = renderPage(<LandingPage />);
    const label = getByTestId("product-experience-phase-label");
    const panel = getByTestId("product-experience-panel");

    assert.match(label.textContent ?? "", /PLANIFICÁ/i);
    assert.equal(panel.getAttribute("data-phase"), "0");

    fireEvent.click(getByRole("button", { name: "Fase siguiente del producto" }));
    assert.match(label.textContent ?? "", /DETECTÁ/i);

    fireEvent.click(getByRole("tab", { name: "RESOLVÉ" }));
    assert.match(label.textContent ?? "", /RESOLVÉ/i);

    fireEvent.click(getByRole("tab", { name: "AUTOMATIZÁ" }));
    assert.match(label.textContent ?? "", /AUTOMATIZÁ/i);

    fireEvent.click(getByRole("tab", { name: "CONTROL" }));
    assert.match(label.textContent ?? "", /CONTROL/i);
  });

  it("product experience panel mantiene altura fija entre fases", () => {
    const { getByTestId, getByRole } = renderPage(<LandingPage />);
    const panel = getByTestId("product-experience-panel");
    const h0 = panel.getBoundingClientRect().height;
    fireEvent.click(getByRole("tab", { name: "DETECTÁ" }));
    fireEvent.click(getByRole("tab", { name: "CONTROL" }));
    const h1 = panel.getBoundingClientRect().height;
    assert.equal(Math.round(h0), Math.round(h1));
  });

  it("no muestra éxito falso en el formulario demo", () => {
    const { getByRole, getByText, queryByText } = renderPage(<LandingPage />);
    const submit = getByRole("button", { name: "Solicitar una demo" });
    assert.equal(submit.hasAttribute("disabled"), true);
    assert.ok(getByText(/Formulario en preparación/i));
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
    assert.equal(queryByText(/Automatizá lo repetitivo\./i), null);
    assert.equal(queryByText(/Toda tu operación\. Una sola vista\./i), null);
  });
});
