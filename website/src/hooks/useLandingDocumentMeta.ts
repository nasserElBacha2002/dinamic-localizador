import { useEffect } from "react";
import { LANDING_SEO } from "../content/landing-content";

function upsertMeta(name: string, content: string, property = false) {
  const attr = property ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useLandingDocumentMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = LANDING_SEO.title;
    upsertMeta("description", LANDING_SEO.description);
    upsertMeta("og:title", LANDING_SEO.title, true);
    upsertMeta("og:description", LANDING_SEO.description, true);
    upsertMeta("og:type", "website", true);

    return () => {
      document.title = previousTitle;
    };
  }, []);
}
