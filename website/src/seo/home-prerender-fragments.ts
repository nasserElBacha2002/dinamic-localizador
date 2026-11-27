import { LANDING_INTERNAL_LINKS, LANDING_PRERENDER_ANCHORS } from "../content/landing-editorial";

const EXPECTED_ANCHOR_IDS = new Set<string>(Object.values(LANDING_PRERENDER_ANCHORS));

function decodeHtmlHref(href: string): string {
  return href.replaceAll("&amp;", "&");
}

function fragmentFromHref(href: string): string | null {
  const decoded = decodeHtmlHref(href.trim());
  const hashIdx = decoded.indexOf("#");
  if (hashIdx === -1) {
    return null;
  }
  const frag = decoded.slice(hashIdx + 1);
  if (!frag) {
    return null;
  }
  if (decoded.startsWith("http")) {
    return null;
  }
  if (decoded.startsWith("/") && !decoded.startsWith("/#") && hashIdx > 0) {
    return null;
  }
  return frag.split("?")[0] ?? null;
}

/** Falla si un enlace de fragmento del HTML inicial no tiene `id` destino en el mismo documento. */
export function assertHomeInitialHtmlFragmentTargets(fullHtml: string): void {
  const idMatches = fullHtml.matchAll(/\bid="([^"]+)"/g);
  const ids = new Set<string>();
  for (const match of idMatches) {
    ids.add(match[1]);
  }

  const hrefMatches = fullHtml.matchAll(/\bhref="([^"#]*#[^"]*)"/g);
  for (const match of hrefMatches) {
    const frag = fragmentFromHref(match[1]);
    if (!frag) {
      continue;
    }
    if (!ids.has(frag)) {
      throw new Error(`Fragmento #${frag} sin id destino (href="${match[1]}")`);
    }
  }

  for (const requiredId of EXPECTED_ANCHOR_IDS) {
    if (!ids.has(requiredId)) {
      throw new Error(`Falta id="${requiredId}" requerido para navegación sin JS`);
    }
  }
}

export function collectHomePrerenderFragmentHrefs(prerenderHtml: string): string[] {
  const hrefs: string[] = [];
  for (const match of prerenderHtml.matchAll(/\bhref="([^"]+)"/g)) {
    hrefs.push(match[1]);
  }
  return hrefs.filter((href) => href.includes("#"));
}

export function assertMarketingInternalLinkFragmentsResolvable(): void {
  const links = [
    LANDING_INTERNAL_LINKS.comoFunciona,
    LANDING_INTERNAL_LINKS.situaciones,
    LANDING_INTERNAL_LINKS.solicitarDemo,
    LANDING_INTERNAL_LINKS.faq,
  ];
  for (const href of links) {
    const frag = fragmentFromHref(href);
    if (!frag || !EXPECTED_ANCHOR_IDS.has(frag)) {
      throw new Error(`LANDING_INTERNAL_LINKS no resuelve ancla: ${href}`);
    }
  }
}