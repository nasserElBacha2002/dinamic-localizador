import { setupDomEnvironment } from "../test/setup-dom";

setupDomEnvironment();

import { installLayoutPolyfills } from "../test/layout-polyfills";

installLayoutPolyfills();

import assert from "node:assert/strict";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, before, describe, it } from "node:test";
import React from "react";
import { installMobileMatchMedia } from "../test/match-media-mobile";
import { HERO_CONTENT, LANDING_SEO } from "../content/landing-content";

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
    const { getByRole, getAllByRole, container } = renderPage(<LandingPage />);

    assert.ok(getByRole("heading", { level: 1, name: HERO_CONTENT.title }));
    assert.equal(container.querySelectorAll("h1").length, 1);
    assert.ok(getAllByRole("link", { name: /Solicitar/i }).length >= 1);
    assert.ok(getByRole("heading", { level: 2, name: /PLANIFICÁ\s+DETECTÁ\s+RESOLVÉ/i }));
  });

  it("hero expone H1, subtítulo y CTAs hacia demo y video", () => {
    const { getByRole, getByText, queryByText, container } = renderPage(<LandingPage />);
    const heroTitle = getByRole("heading", { level: 1, name: HERO_CONTENT.title });
    const heroCopy = heroTitle.parentElement;
    assert.ok(heroCopy);
    assert.ok(getByText(HERO_CONTENT.lead));
    assert.equal(queryByText(/Mirá Dinamic en acción/i), null);
    const copyText = heroCopy.textContent ?? "";
    assert.equal(/PLANIFICÁ\s*·\s*DETECTÁ\s*·\s*RESOLVÉ/i.test(copyText), false);

    const demoCta = heroCopy.querySelector('a[href="#solicitar-demo"]');
    assert.ok(demoCta);
    assert.equal(demoCta?.textContent, HERO_CONTENT.ctaPrimary.label);

    const videoCta = heroCopy.querySelector('a[href="#como-funciona"]');
    assert.ok(videoCta);
    assert.equal(videoCta?.textContent, HERO_CONTENT.ctaSecondary.label);

    assert.equal(container.querySelector("#como-funciona")?.tagName.toLowerCase(), "section");
  });

  it("aplica SEO title y meta description de home en runtime", async () => {
    renderPage(<LandingPage />);
    await waitFor(() => {
      assert.equal(document.title, LANDING_SEO.title);
      const description = document.querySelector('meta[name="description"]');
      assert.ok(description);
      assert.equal(description.getAttribute("content"), LANDING_SEO.description);
    });
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
    const { getByRole, getByTestId, container } = renderPage(<LandingPage />);
    const section = container.querySelector("#como-funciona");
    assert.ok(section);
    assert.ok(getByRole("heading", { level: 2, name: /PLANIFICÁ\s+DETECTÁ\s+RESOLVÉ/i }));
    assert.match(section.textContent ?? "", /Mirá cómo Dinamic Operations convierte/i);
    assert.equal(container.querySelectorAll('[data-testid="product-flow-divider"]').length, 0);
    const video = getByTestId("product-video") as HTMLVideoElement;
    assert.equal(video.getAttribute("src"), "/video/dinamic-operations-60s-horizontal.mp4");
    assert.equal(video.hasAttribute("autoplay"), true);
    assert.equal(video.muted, true);
    assert.equal(video.loop, true);
    assert.ok(getByRole("button", { name: /Activar sonido del video/i }));
  });

  it("no muestra éxito falso en el formulario demo sin API configurada", () => {
    const { getByRole, getByText, queryByText } = renderPage(<LandingPage />);
    const submit = getByRole("button", { name: "Solicitar una demo" });
    assert.equal(submit.hasAttribute("disabled"), true);
    assert.ok(getByText(/vinculada al API/i));
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

  it("navbar muestra lockup horizontal e isotipo para el viewport", () => {
    const { getByRole } = renderPage(<LandingPage />);
    const homeLink = getByRole("link", { name: "Inicio Dinamic Operations" });
    assert.ok(homeLink.querySelector('img[src="/brand/dinamic-operations-logo.png"]'));
    assert.ok(homeLink.querySelector('img[src="/brand/dinamic-operations-isotipo.png"]'));
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

  it("coloca la sección comercial después de WhatsApp y antes de situaciones reales", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const whatsapp = getByTestId("whatsapp-section");
    const commercial = getByTestId("commercial-section");
    const situations = document.getElementById("situaciones");
    assert.ok(whatsapp && commercial && situations);
    assert.ok(whatsapp.compareDocumentPosition(commercial) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(commercial.compareDocumentPosition(situations) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("expone estado de animación comercial al entrar en viewport", async () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const commercial = getByTestId("commercial-section");
    assert.equal(commercial.getAttribute("data-reduced"), "false");
    await waitFor(
      () => {
        assert.equal(commercial.getAttribute("data-in-view"), "true");
      },
      { timeout: 3000 },
    );
  });

  it("expone incorporación, Plan Lanzamiento y condiciones comerciales", () => {
    const { getByRole, getByTestId, getByText } = renderPage(<LandingPage />);
    const section = getByTestId("commercial-section");
    assert.ok(getByRole("heading", { name: /Todo lo que necesitás para empezar/i }));
    assert.ok(getByText(/Costo inicial de incorporación \+ abono recurrente/i));
    assert.ok(getByText(/Etapa de lanzamiento/i));
    assert.ok(getByRole("heading", { name: "Plan Lanzamiento", level: 3 }));
    assert.ok(getByText("Precio a consultar"));
    assert.ok(getByText(/Plataforma SaaS estándar/i));
    assert.equal(/Hasta 100 colaboradores/i.test(section.textContent ?? ""), false);
    assert.match(section.textContent ?? "", /Fichaje con ubicación desde WhatsApp/);
  });

  it("no expone importes de catálogo ni decoración de precio en la sección comercial", () => {
    const { getByTestId, queryByTestId } = renderPage(<LandingPage />);
    const section = getByTestId("commercial-section");
    const text = section.textContent ?? "";
    assert.equal(/\bUSD\b/i.test(text), false);
    assert.equal(/\$\s*\d/.test(text), false);
    assert.equal(/\b300\b/.test(text), false);
    assert.equal(queryByTestId("commercial-price-decor"), null);
  });

  it("CTA comerciales apuntan a demo y video existentes", () => {
    const { getByTestId } = renderPage(<LandingPage />);
    const card = getByTestId("launch-plan-card");
    const links = card.querySelectorAll("a");
    assert.equal(links.length, 2);
    assert.ok(
      Array.from(links).some(
        (link) =>
          link.textContent === "Solicitar propuesta comercial" && link.getAttribute("href") === "#solicitar-demo",
      ),
    );
    assert.ok(
      Array.from(links).some(
        (link) =>
          link.textContent === "Conocé aún más" &&
          link.getAttribute("href") ===
            "https://drive.google.com/file/d/1b5oVGShKFr-CoK-hPKYzPJlfWhRg2fVv/view?usp=sharing" &&
          link.getAttribute("target") === "_blank" &&
          link.getAttribute("rel") === "noopener noreferrer",
      ),
    );
  });

  it("corrige el CTA post-video sin mensaje de personalización", () => {
    const { getByTestId, queryByText } = renderPage(<LandingPage />);
    const postVideo = getByTestId("cta-post-video");
    assert.match(
      postVideo.textContent ?? "",
      /herramientas de Dinamic Operations para gestionar tus servicios/i,
    );
    assert.equal(queryByText(/puede adaptarse a tus servicios/i), null);
  });
});
