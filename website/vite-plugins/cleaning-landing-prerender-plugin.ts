import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { buildCleaningPrerenderHtml, CLEANING_PRERENDER_HEAD_SNIPPET } from "./cleaning-prerender-html";

type Next = () => void;

function redirectCleaningLandingNoSlash(req: IncomingMessage, res: ServerResponse, next: Next): void {
  const rawUrl = req.url ?? "";
  const pathOnly = rawUrl.split("?")[0] ?? "";
  if (pathOnly === "/software-empresas-limpieza") {
    const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
    res.statusCode = 301;
    res.setHeader("Location", `/software-empresas-limpieza/${query}`);
    res.end();
    return;
  }
  next();
}

export function cleaningLandingPrerenderPlugin(): Plugin {
  return {
    name: "cleaning-landing-prerender",
    configureServer(server) {
      server.middlewares.use(redirectCleaningLandingNoSlash);
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const path = ctx.filename ?? "";
        if (!path.includes("software-empresas-limpieza/index.html")) {
          return html;
        }
        const prerender = buildCleaningPrerenderHtml();
        return html
          .replace("</head>", `${CLEANING_PRERENDER_HEAD_SNIPPET}\n</head>`)
          .replace('<div id="root"></div>', `${prerender}\n    <div id="root"></div>`);
      },
    },
  };
}