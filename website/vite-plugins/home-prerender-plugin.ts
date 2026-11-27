import type { Plugin } from "vite";
import { buildHomeHeadSnippets, buildHomePrerenderHtml } from "./home-prerender-html";
import { LANDING_OG_IMAGE } from "../src/content/landing-editorial";
import { LANDING_SEO } from "../src/content/landing-content";

export function homePrerenderPlugin(): Plugin {
  return {
    name: "home-prerender",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const path = ctx.filename ?? "";
        if (!path.endsWith("/index.html") || path.includes("software-empresas-limpieza") || path.includes("privacidad")) {
          return html;
        }
        const prerender = buildHomePrerenderHtml();
        const ogBlock = `
    <meta property="og:image" content="${LANDING_OG_IMAGE.url}" />
    <meta property="og:image:width" content="${LANDING_OG_IMAGE.width}" />
    <meta property="og:image:height" content="${LANDING_OG_IMAGE.height}" />
    <meta property="og:image:alt" content="${LANDING_OG_IMAGE.alt.replace(/"/g, "&quot;")}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${LANDING_SEO.title.replace(/"/g, "&quot;")}" />
    <meta name="twitter:description" content="${LANDING_SEO.description.replace(/"/g, "&quot;")}" />
    <meta name="twitter:image" content="${LANDING_OG_IMAGE.url}" />`;
        return html
          .replace("</head>", `${buildHomeHeadSnippets()}${ogBlock}\n</head>`)
          .replace('<div id="root"></div>', `${prerender}\n    <div id="root"></div>`);
      },
    },
  };
}