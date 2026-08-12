/**
 * Runtime smoke: real @google-cloud/storage → gaxios / teeny-request → uuid override.
 * No mocks. No external GCS/network required (local HTTP only for multipart path).
 *
 * Used by:
 * - unit suite (imported via google-sdk-compatibility.test.ts)
 * - Node 20 Docker production image (`node /smoke.cjs`)
 */
"use strict";

const http = require("node:http");
const path = require("node:path");
const { createRequire } = require("node:module");

const requireFromHere = createRequire(__filename);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function semverGte(version, minimum) {
  const parse = (v) =>
    String(v)
      .replace(/^v/, "")
      .split(".")
      .map((p) => Number.parseInt(p, 10) || 0);
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return true;
}

function resolveUuidVia(consumerPackageName) {
  const consumerEntry = requireFromHere.resolve(consumerPackageName);
  const uuidPath = requireFromHere.resolve("uuid", { paths: [path.dirname(consumerEntry)] });
  const uuid = requireFromHere(uuidPath);
  // Prefer package.json export; walk up from resolved file as fallback.
  let version;
  try {
    version = requireFromHere(path.join(path.dirname(uuidPath), "package.json")).version;
  } catch {
    version = undefined;
  }
  if (!version) {
    let dir = path.dirname(uuidPath);
    for (let i = 0; i < 4; i += 1) {
      try {
        const pkg = requireFromHere(path.join(dir, "package.json"));
        if (pkg.name === "uuid") {
          version = pkg.version;
          break;
        }
      } catch {
        // continue
      }
      dir = path.dirname(dir);
    }
  }
  if (!version) {
    version = requireFromHere("uuid/package.json").version;
  }
  return { uuid, version, uuidPath };
}

async function exerciseGaxiosMultipart(baseUrl) {
  const { Gaxios } = requireFromHere("gaxios");
  const client = new Gaxios();
  const response = await client.request({
    url: `${baseUrl}/gaxios-multipart`,
    method: "POST",
    multipart: [
      {
        headers: { "Content-Type": "application/json" },
        content: JSON.stringify({ smoke: true }),
      },
      {
        headers: { "Content-Type": "text/plain" },
        content: "phase4-uuid-override",
      },
    ],
  });
  assert(response.status === 200, `gaxios multipart expected 200, got ${response.status}`);
  assert(
    typeof response.data?.boundary === "string" && response.data.boundary.length > 0,
    "gaxios multipart response missing boundary echo",
  );
  return response.data.boundary;
}

async function exerciseTeenyRequestMultipart(baseUrl) {
  const { Readable } = require("node:stream");
  const teenyRequest = requireFromHere("teeny-request");
  const request = teenyRequest.teenyRequest || teenyRequest;
  // teeny-request only ends the multipart stream when the second part is a stream.
  const body = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("teeny-request multipart timed out")), 10_000);
    request(
      {
        uri: `${baseUrl}/teeny-multipart`,
        method: "POST",
        headers: {},
        multipart: [
          { "Content-Type": "application/json", body: '{"ok":true}' },
          { "Content-Type": "text/plain", body: Readable.from(["teeny"]) },
        ],
      },
      (err, res, responseBody) => {
        clearTimeout(timer);
        if (err) {
          reject(err);
          return;
        }
        assert(res && res.statusCode === 200, `teeny-request expected 200, got ${res?.statusCode}`);
        resolve(responseBody);
      },
    );
  });
  const parsed = typeof body === "string" ? JSON.parse(body) : body;
  assert(typeof parsed?.boundary === "string" && parsed.boundary.length > 0, "teeny boundary missing");
  return parsed.boundary;
}

async function runGoogleSdkCompatibilitySmoke() {
  const report = {
    node: process.version,
    uuid: null,
    gaxiosUuid: null,
    teenyUuid: null,
    storageConstructed: false,
    gaxiosBoundary: null,
    teenyBoundary: null,
    cjsOk: true,
  };

  // --- load real packages (no mocks) ---
  const storageMod = requireFromHere("@google-cloud/storage");
  const gaxiosMod = requireFromHere("gaxios");
  const teenyMod = requireFromHere("teeny-request");
  const uuidDirect = requireFromHere("uuid");
  const uuidPkg = requireFromHere("uuid/package.json");

  assert(storageMod && storageMod.Storage, "@google-cloud/storage.Storage missing");
  assert(gaxiosMod, "gaxios failed to load");
  assert(teenyMod, "teeny-request failed to load");
  assert(typeof uuidDirect.v4 === "function", "uuid.v4 missing on direct require");
  assert(semverGte(uuidPkg.version, "11.1.1"), `uuid ${uuidPkg.version} < 11.1.1`);
  report.uuid = uuidPkg.version;

  const sample = uuidDirect.v4();
  assert(
    typeof sample === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sample),
    `uuid.v4 produced unexpected value: ${sample}`,
  );

  const viaGaxios = resolveUuidVia("gaxios");
  assert(semverGte(viaGaxios.version, "11.1.1"), `gaxios resolved uuid ${viaGaxios.version}`);
  assert(typeof viaGaxios.uuid.v4 === "function", "gaxios→uuid.v4 missing");
  report.gaxiosUuid = viaGaxios.version;

  const viaTeeny = resolveUuidVia("teeny-request");
  assert(semverGte(viaTeeny.version, "11.1.1"), `teeny-request resolved uuid ${viaTeeny.version}`);
  assert(typeof viaTeeny.uuid.v4 === "function", "teeny→uuid.v4 missing");
  report.teenyUuid = viaTeeny.version;

  // Consumers in installed sources use only uuid.v4() for multipart boundaries
  // (gaxios build/src/gaxios.js ~417; teeny-request build/src/index.js ~135).

  const { Storage } = storageMod;
  const storage = new Storage({ projectId: "phase4-compat-smoke" });
  assert(storage && typeof storage.bucket === "function", "Storage.bucket missing");
  report.storageConstructed = true;

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const contentType = String(req.headers["content-type"] || "");
      const match = /boundary=([^;]+)/i.exec(contentType);
      const boundary = match?.[1] ?? "";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: req.url, boundary }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address === "object", "listen failed");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    report.gaxiosBoundary = await exerciseGaxiosMultipart(baseUrl);
    report.teenyBoundary = await exerciseTeenyRequestMultipart(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // ESM/CJS: uuid 11 exposes CJS via exports.require; consumers use require("uuid").
  assert(report.cjsOk, "CJS require path failed");

  return report;
}

async function main() {
  const report = await runGoogleSdkCompatibilitySmoke();
  process.stdout.write(`${JSON.stringify({ ok: true, report }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { runGoogleSdkCompatibilitySmoke, semverGte };
