#!/usr/bin/env node
/**
 * DIN-506 — validación HTTP website + apex simulado (separated / legacy-unified).
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(websiteRoot, "..");
const port = Number(process.env.DIN506_HTTP_PORT ?? "18107");
const imageWebsite = `dinamic-website-din506-probe`;
const network = `din506-net-${port}`;
const lines = [];

function log(msg) {
  lines.push(msg);
  console.log(msg);
}

function sh(cmd) {
  log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", shell: "/bin/bash" });
}

function shQuiet(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    /* optional */
  }
}

function httpGet(portNum, path) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port: portNum, path, method: "GET" },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            type: res.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitHealth(portNum) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await httpGet(portNum, "/health");
      if (r.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("timeout waiting for /health");
}

function apexConf(mode) {
  const dir = join(websiteRoot, ".din506-http");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `apex-${mode}.conf`);
  const website = "http://din506-website";
  const frontend = "http://din506-frontend";
  const core = `  location = /software-empresas-limpieza { proxy_pass ${website}; proxy_set_header Host $host; }
  location ^~ /software-empresas-limpieza/ { proxy_pass ${website}; proxy_set_header Host $host; }
  location ~ ^/software-empresas-limpieza[^/]+$ { return 404; }
  location = /login { return 301 http://app.example.test/login$is_args$args; }`;
  const tail =
    mode === "legacy"
      ? `  location / { proxy_pass ${frontend}; proxy_set_header Host $host; }\n`
      : `  location / { proxy_pass ${website}; proxy_set_header Host $host; }\n`;
  writeFileSync(path, `server {\n  listen 80;\n${core}\n${tail}}\n`);
  return path;
}

function frontendDummyConf() {
  const dir = join(websiteRoot, ".din506-http");
  const path = join(dir, "frontend-dummy.conf");
  writeFileSync(path, "server { listen 80; location / { return 200 'frontend-app\\n'; add_header Content-Type text/plain; } }\n");
  return path;
}

async function assertCases(label, portNum, extra = []) {
  const cases = [
    ["/", 200],
    ["/software-empresas-limpieza", 301],
    ["/software-empresas-limpieza?utm_source=linkedin", 301],
    ["/software-empresas-limpieza/?utm_source=linkedin", 200],
    ["/software-empresas-limpieza/", 200],
    ["/software-empresas-limpieza/inexistente", 404],
    ["/software-empresas-limpieza123", 404],
    ["/robots.txt", 200],
    ["/sitemap.xml", 200],
    ["/marketing/cleaning-landing/tablero-operativo.webp", 200],
    ...extra,
  ];
  for (const [path, expected] of cases) {
    const r = await httpGet(portNum, path);
    log(`${label} GET ${path} → HTTP ${r.status} (expected ${expected}) Location: ${r.location ?? "-"}`);
    if (r.status !== expected) {
      throw new Error(`${label} ${path}: got ${r.status}, expected ${expected}`);
    }
    if (expected === 301) {
      if (!r.location?.includes("/software-empresas-limpieza/")) {
        throw new Error(`bad redirect: ${r.location}`);
      }
      if (path.includes("utm_source=linkedin") && !r.location.includes("utm_source=linkedin")) {
        throw new Error(`query not preserved: ${r.location}`);
      }
      if (/127\.0\.0\.1:\d+/.test(r.location ?? "")) {
        throw new Error(`internal port in Location: ${r.location}`);
      }
    }
    if (path.endsWith(".webp") && !String(r.type).includes("image/webp")) {
      throw new Error(`unexpected content-type: ${r.type}`);
    }
    if (path === "/" && !r.body.includes("frontend-app")) {
      if (!r.body.includes('id="home-seo-prerender"')) {
        throw new Error("home prerender missing in HTML");
      }
      if (!r.body.includes("preguntas-frecuentes")) {
        throw new Error("home FAQ anchor missing in HTML");
      }
    }
  }
  const landing = await httpGet(portNum, "/software-empresas-limpieza/");
  if (!landing.body.includes("id=\"cleaning-seo-prerender\"")) throw new Error("prerender missing in HTML");
  if (!landing.body.includes("Coordiná tus equipos de limpieza en cada edificio")) throw new Error("H1 copy missing");
}

function cleanup() {
  shQuiet("docker rm -f din506-website din506-apex din506-frontend");
  shQuiet(`docker network rm ${network}`);
}

async function startStack({ apexMode, apexPort }) {
  shQuiet(`docker network create ${network}`);
  sh(`docker build -t ${imageWebsite} "${websiteRoot}"`);
  sh(`docker run -d --rm --name din506-website --network ${network} ${imageWebsite}`);
  if (apexMode === "legacy") {
    const fc = frontendDummyConf();
    sh(
      `docker run -d --rm --name din506-frontend --network ${network} -v "${fc}:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine`,
    );
  }
  const ac = apexConf(apexMode);
  sh(
    `docker run -d --rm --name din506-apex --network ${network} -p ${apexPort}:80 -v "${ac}:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine`,
  );
  await new Promise((r) => setTimeout(r, 1200));
}

async function main() {
  if (!existsSync(join(websiteRoot, "dist/software-empresas-limpieza/index.html"))) {
    throw new Error("dist/ missing — ejecutar npm run build");
  }

  cleanup();
  try {
    log("=== WEBSITE directo (puerto publicado) ===");
    sh(`docker build -t ${imageWebsite} "${websiteRoot}"`);
    sh(`docker run -d --rm --name din506-website -p ${port}:80 ${imageWebsite}`);
    await waitHealth(port);
    await assertCases("website", port);

    log("=== APEX separated ===");
    shQuiet("docker rm -f din506-website");
    await startStack({ apexMode: "separated", apexPort: port + 1 });
    await assertCases("apex-separated", port + 1);
    const loginSep = await httpGet(port + 1, "/login");
    log(`apex-separated /login → ${loginSep.status} ${loginSep.location ?? ""}`);
    if (loginSep.status !== 301) throw new Error("login redirect expected 301");

    log("=== APEX legacy-unified ===");
    cleanup();
    await startStack({ apexMode: "legacy", apexPort: port + 2 });
    await assertCases("apex-legacy", port + 2);
    const cleaning = await httpGet(port + 2, "/software-empresas-limpieza/");
    if (!cleaning.body.includes("cleaning-seo-prerender")) throw new Error("legacy: cleaning not from website");
    const ops = await httpGet(port + 2, "/operations");
    log(`apex-legacy GET /operations → ${ops.status} body=${ops.body.slice(0, 20)}`);
    if (!ops.body.includes("frontend-app")) throw new Error("legacy: /operations should hit frontend");

    writeFileSync(join(repoRoot, "DIN-506-http-validation.md"), `# DIN-506 HTTP validation\n\n${lines.join("\n")}\n\nExit: 0 PASS\n`);
    log("PASS");
  } finally {
    cleanup();
    shQuiet(`docker rm -f din506-website`);
  }
}

main().catch((err) => {
  console.error(err);
  writeFileSync(
    join(repoRoot, "DIN-506-http-validation.md"),
    `# DIN-506 HTTP validation\n\nFAILED: ${err.message}\n\n${lines.join("\n")}\n`,
  );
  process.exit(1);
});