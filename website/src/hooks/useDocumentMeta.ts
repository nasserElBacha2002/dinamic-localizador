import { useEffect } from "react";

export type DocumentSeo = {
  readonly title: string;
  readonly description: string;
  readonly canonicalUrl: string;
  readonly ogImage?: string;
  readonly ogImageAlt?: string;
};

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

export function useDocumentMeta(seo: DocumentSeo) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = seo.title;
    upsertMeta("description", seo.description);
    upsertMeta("og:title", seo.title, true);
    upsertMeta("og:description", seo.description, true);
    upsertMeta("og:type", "website", true);
    upsertMeta("og:url", seo.canonicalUrl, true);
    if (seo.ogImage) {
      upsertMeta("og:image", seo.ogImage, true);
    }
    if (seo.ogImageAlt) {
      upsertMeta("og:image:alt", seo.ogImageAlt, true);
    }
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", seo.canonicalUrl);

    return () => {
      document.title = previousTitle;
    };
  }, [seo.title, seo.description, seo.canonicalUrl, seo.ogImage, seo.ogImageAlt]);
}