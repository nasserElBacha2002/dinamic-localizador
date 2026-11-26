import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { buildPrivacyPrerenderHtml, PRIVACY_PRERENDER_HEAD_SNIPPET } from "./privacy-prerender-html";

type Next = () => void;

function redirectPrivacyNoSlash(req: IncomingMessage, res: ServerResponse, next: Next): void {
  const rawUrl = req.url ?? "";
  const pathOnly = rawUrl.split("?")[0] ?? "";
  if (pathOnly === "/privacidad") {
    const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";
    res.statusCode = 301;
    res.setHeader("Location", `/privacidad/${query}`);
    res.end();
    return;
  }
  next();
}

export function privacyPolicyPrerenderPlugin(): Plugin {
  return {
    name: "privacy-policy-prerender",
    configureServer(server) {
      server.middlewares.use(redirectPrivacyNoSlash);
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const path = ctx.filename ?? "";
        if (!path.includes("privacidad/index.html")) {
          return html;
        }
        const prerender = buildPrivacyPrerenderHtml();
        return html
          .replace("</head>", `${PRIVACY_PRERENDER_HEAD_SNIPPET}\n</head>`)
          .replace('<div id="root"></div>', `${prerender}\n    <div id="root"></div>`);
      },
    },
  };
}
