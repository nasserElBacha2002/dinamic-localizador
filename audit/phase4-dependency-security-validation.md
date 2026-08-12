# Phase 4 — Dependency Security Validation

**Status:** `IMPLEMENTED_AND_VALIDATED`  
**Date:** 2026-08-12  
**Scope:** npm advisories, transitive supply chain, safe upgrades, GCS regression, lockfile reproducibility  
**Out of scope:** SQL layer-boundary cleanup, God Classes, WhatsApp bot decomposition, Node runtime upgrade

---

## Dependency Security summary

```text
Initial advisories reviewed: 7 (backend 5 moderate + root 2 critical)
Direct vulnerable dependencies: 1 (@google-cloud/storage, via transitive uuid)
Transitive vulnerable dependencies: uuid (x2 paths), gaxios, teeny-request, retry-request, shell-quote
Dependencies upgraded: 2 deliberate (@google-cloud/storage, concurrently) + 1 justified override (uuid)
Critical remaining: 0
High remaining: 0
Moderate remaining: 0
npm ci: PASS (backend + root)
Backend build/tests: PASS
Frontend audit/build/tests: PASS (0 vulns; lock unchanged)
Application storage contract: PASS (mocked wrapper)
Google SDK compatibility: PASS (real packages + multipart v4 paths)
Node 20 SDK runtime: PASS (production image v20.20.2)
Real GCS provider integration: NOT RUN (no ADC/bucket credentials this session)
Payroll/attachments unit regression: PASS
Supply-chain verification: PASS (npm audit signatures)
Quality gates: NOT lowered
npm audit fix --force: NOT used
Generated phase4 *-diff/status: gitignored (not versioned)
```

---

## Audit before / after

### Backend

```text
BEFORE
critical: 0
high: 0
moderate: 5
low: 0

AFTER
critical: 0
high: 0
moderate: 0
low: 0
```

### Frontend

```text
BEFORE
critical: 0
high: 0
moderate: 0
low: 0

AFTER
critical: 0
high: 0
moderate: 0
low: 0
```

### Root (dev tooling: `concurrently`)

```text
BEFORE
critical: 2  (shell-quote <=1.8.3 via concurrently@9.2.1 → shell-quote@1.8.3)
high: 0
moderate: 0
low: 0

AFTER
critical: 0
high: 0
moderate: 0
low: 0
```

Evidence snapshots under `/tmp/phase4-deps/` (`backend-audit-before.json`, `backend-audit-after.json`, signatures logs).

---

## Dependency inventory

| Package | Installed before | After | Direct/Transitive | Severity | Used by | Reason |
| --- | ---: | ---: | --- | --- | --- | --- |
| `@google-cloud/storage` | 7.21.0 | **7.22.0** | direct | moderate (via tree) | absence attachments, payroll receipts, signed URLs, pilot script | deliberate minor bump; does **not** alone clear uuid |
| `uuid` | 9.0.1 | **11.1.1** | transitive | moderate GHSA-w5hq-g745-h8pq | `gaxios`, `teeny-request` (multipart boundary / request ids via **v4 only**) | justified `overrides.uuid` |
| `gaxios` | 6.7.1 | 6.7.1 | transitive | moderate (via uuid) | Google auth / Storage HTTP | parent still pins uuid ^9; fixed via override |
| `teeny-request` | 9.0.0 | 9.0.0 | transitive | moderate (via uuid) | Storage retries | same |
| `retry-request` | 7.0.2 | 7.0.2 | transitive | moderate (via teeny-request) | Storage | same |
| `concurrently` | 9.2.1 | **9.2.4** | direct (root **dev**) | critical (via shell-quote) | `npm run dev` only | deliberate patch bump |
| `shell-quote` | 1.8.3 | **1.9.0** | transitive (root **dev**) | critical | concurrently | fixed by parent bump |

App code does **not** import the `uuid` package. IDs use `node:crypto.randomUUID()`.

---

## Advisories

### GHSA-w5hq-g745-h8pq / CVE-2026-41907 — `uuid` (< 11.1.1)

| Field | Value |
| --- | --- |
| Severity (npm) | moderate (CVSS 7.5 integrity) |
| Vulnerable APIs | `v3()` / `v5()` / `v6()` when caller-supplied `buf` is too small / offset invalid |
| Installed before | 9.0.1 (two trees under Storage) |
| Patched | ≥ 11.1.1 (also 12.0.1 / 13.0.1 / 14.0.0 lines) |
| Paths | `@google-cloud/storage` → `gaxios` → `uuid`; `@google-cloud/storage` → `teeny-request` → `uuid` |
| Runtime / dev | **runtime** (backend production image includes Storage) |
| Project exploitability | **low** — Google clients call `uuid.v4()` only (boundary / ids); vulnerable APIs not on our call path; no user-controlled buf/offset into uuid |
| Fix | override `uuid` → `^11.1.1` (parents still declare `^9`; npm audit “fix” via Storage **5.18.3** is a **breaking downgrade** — rejected) |

### Root `shell-quote` criticals (via `concurrently`)

| Field | Value |
| --- | --- |
| Severity | critical (npm audit before) |
| Path | `concurrently@9.2.1` → `shell-quote@1.8.3` |
| Runtime / dev | **dev-only** (`npm run dev` at monorepo root) |
| Project exploitability | low in production (not shipped in backend/frontend images) |
| Fix | `concurrently` → `^9.2.4` → `shell-quote@1.9.0` |

---

## Breaking changes

- **None** in application code.
- `@google-cloud/storage` **7.21.0 → 7.22.0** (same major 7). Engines in package: `node >=18` (was `>=14`). Production Docker: `node:20-alpine` — compatible. No Node upgrade required.
- `uuid` **9 → 11** via override only: CommonJS `require('uuid').v4` verified under **Node 22 (local)** and **Node 20.20.2 (Docker production image)** via real gaxios/teeny-request multipart paths.
- Rejected: `npm audit fix --force` path that would install Storage **5.18.3** (semver major downgrade).

---

## Code changes

| File | Change |
| --- | --- |
| `backend/package.json` | `@google-cloud/storage` `^7.21.0` → `^7.22.0`; `overrides.uuid` `^11.1.1` (kept existing `brace-expansion` override) |
| `backend/package-lock.json` | Storage 7.22.0 + uuid 11.1.1 resolved/integrity |
| `package.json` | `concurrently` `^9.2.1` → `^9.2.4` |
| `package-lock.json` | concurrently 9.2.4 + shell-quote 1.9.0 |
| `gcs-attachment-storage.test.ts` | mocked wrapper contract (`storage as never` test double — intentional) |
| `google-sdk-compatibility.test.ts` | unit harness for real-package smoke |
| `scripts/google-sdk-compatibility-smoke.cjs` | real Storage/gaxios/teeny-request/uuid smoke (no mocks; local HTTP only) |
| `.gitignore` | ignore generated `audit/phase4-dependency-security-{diff,diffstat,status}.txt` |

No GCS credential / TTL / ADC / Workload Identity / architecture changes.

---

## Override justification

```text
override:
  package: uuid
  version: ^11.1.1
  reason: Parent SDKs (gaxios@6.7.1, teeny-request@9.0.0) still declare uuid ^9; no patched parent release clears GHSA-w5hq-g745-h8pq without forcing Storage 5.x downgrade.
  upstream issue: GHSA-w5hq-g745-h8pq; npm audit suggests unsafe Storage 5.18.3 downgrade
  API compatibility: consumers use uuid.v4() only — confirmed in installed sources:
    gaxios@6.7.1 build/src/gaxios.js:63 require("uuid"); :417 uuid.v4() multipart boundary
    teeny-request@9.0.0 build/src/index.js:22 require("uuid"); :135 uuid.v4() multipart boundary
  exercised: gaxios + teeny-request multipart requests against local HTTP (real modules)
  removal condition: remove when @google-cloud/storage (or gaxios/teeny-request) depends on uuid >=11.1.1 without override
```

Existing unrelated override retained: `brace-expansion@5.0.9`.

---

## GCS layers (separated)

### Application storage contract

**Result: PASS**

`gcs-attachment-storage.test.ts` (mocked `Storage` injection via `as never` test double):

| Flow | Result |
| --- | --- |
| `putObject` write stream + `getMetadata` generation as **string** | PASS |
| Signed download URL (`v4` / `read` / TTL) | PASS |
| Signed upload URL (`v4` / `write` / contentType) | PASS |
| Error mapping 404 → `GCS_OBJECT_NOT_FOUND`, 403 → `GCS_PERMISSION_DENIED` | PASS |
| `deleteObject` `ignoreNotFound` + `checkAccess` | PASS |
| In-memory attachment + payrollReceiptService unit | PASS |

### Google SDK compatibility

**Result: PASS**

`scripts/google-sdk-compatibility-smoke.cjs` + `google-sdk-compatibility.test.ts` load **real** packages (no mocks):

| Check | Result |
| --- | --- |
| `@google-cloud/storage` / `gaxios` / `teeny-request` / `uuid` load | PASS |
| Effective `uuid` version | **11.1.1** (≥ 11.1.1) via gaxios and teeny-request resolution |
| `uuid.v4()` | PASS |
| gaxios multipart path (real `uuid.v4` boundary) | PASS (local HTTP) |
| teeny-request multipart path (real `uuid.v4` boundary) | PASS (local HTTP) |
| `new Storage({ projectId })` | PASS |
| CJS `require('uuid')` under uuid@11 | PASS (no ESM breakage) |

### Node 20 SDK runtime

**Result: PASS**

Executed smoke inside production image (`node:20-alpine`, Node **v20.20.2**):

```text
docker build -f backend/Dockerfile --target production -t dinamic-phase4-backend-deps:test backend
docker run --rm -w /app \
  -v "$PWD/backend/scripts/google-sdk-compatibility-smoke.cjs:/app/google-sdk-compatibility-smoke.cjs:ro" \
  dinamic-phase4-backend-deps:test \
  node /app/google-sdk-compatibility-smoke.cjs
→ ok:true, uuid 11.1.1, storageConstructed, gaxios/teeny boundaries
```

Docker **build alone is not sufficient**; this is an explicit runtime execution.

### Real GCS provider integration

**Result: NOT RUN**

```text
gcs:pilot:absence-attachments against real GCS
integration tests requiring live bucket / ADC credentials
```

No ADC/bucket credentials available in this session. **Not declared PASS.**

### Retry / timeouts / credentials

- No new app-level retries added (avoid stacking with SDK retries).
- No TTL / signed URL expiration business defaults changed.
- Credentials still ADC / projectId via existing `Storage({ projectId })` — no hardcoded keys.

---

## Supply chain

| Check | Result |
| --- | --- |
| `npm audit signatures` (backend) | **367 packages verified registry signatures**; 67 attestations |
| `npm audit signatures` (root) | **25 packages verified**; 1 attestation |
| `npm audit fix --force` | **not used** |
| Lifecycle scripts on upgraded packages | Storage / gaxios / teeny-request / uuid: **no** `hasInstallScript` |
| Dependabot / Renovate | **not present** — follow-up optional |
| SBOM tooling | **not present** — follow-up optional |
| New direct dependencies | **none** |
| Lockfile integrity/resolved | preserved (npm install/ci only) |

---

## Residual risk

**None remaining in `npm audit` for backend / frontend / root.**

Historical note (mitigated):

| Advisory | Why it mattered | Mitigation now | Follow-up |
| --- | --- | --- | --- |
| GHSA-w5hq-g745-h8pq | Runtime transitive under Storage | uuid override 11.1.1 | Drop override when upstream bumps |
| shell-quote criticals | Dev-only via concurrently | concurrently 9.2.4 | Consider Dependabot for root + backend |

Outside `npm audit`: typosquatting / compromised maintainer risk remains inherent to npm; no additional tooling added this phase.

---

## Node / Docker / CI

| Item | Evidence |
| --- | --- |
| Local Node | v22.14.0 / npm 11.4.2 (unit suite) |
| Backend Docker base | `FROM node:20-alpine` — Storage engines `>=18` OK |
| Backend image build | `docker build … --target production` → **PASS** |
| Node 20 runtime smoke | **PASS** inside production image (v20.20.2) — see GCS layers |
| `docker compose config` | fails without filled `.env` ports (pre-existing; unrelated) |
| `npm ci` clean | backend + root **PASS**; audit still 0 |
| Frontend lock | unchanged; audit 0 |
| Generated review txt under `audit/phase4-*-{diff,diffstat,status}.txt` | **gitignored**; removed from tracking |

---

## Validation commands

| Command | Result |
| --- | --- |
| `npm audit --prefix backend` (before) | 5 moderate |
| `npm audit --prefix backend` (after / after `npm ci`) | 0 |
| `npm audit --prefix frontend` | 0 |
| `npm audit` (root after) | 0 |
| `npm audit signatures` backend/root | PASS |
| `npm ci` backend + root | PASS |
| `npm run lint --prefix backend` | PASS |
| `npm run build --prefix backend` | PASS |
| `npm test --prefix backend` | PASS |
| GCS mocked contract + SDK compatibility unit | PASS |
| Node 20 Docker production runtime smoke | PASS (v20.20.2) |
| `npm run lint --prefix frontend` | PASS (0 errors, 8 pre-existing warnings) |
| `npm run build --prefix frontend` | PASS |
| `npm test --prefix frontend` | PASS |
| Backend Docker production build | PASS |
| Real GCS pilot | **NOT RUN** |
| Full `test:integration` DB suite | SKIP this correction (no dep logic / SQL change) |

---

## Acceptance checklist

1. Initial advisories identified — **yes**
2. Dependency paths known — **yes**
3. No `npm audit fix --force` — **yes**
4. Deliberate minimal upgrades — **yes**
5. No critical/high remaining — **yes**
6. Correctable moderates fixed — **yes**
7. Residual moderate justified — **n/a (none)**
8–12. GCS/signed URL/upload/payroll/attachments contracts — **yes (mocked + unit)**
13–14. `npm ci` + reproducible lock — **yes**
15. Prod Node compatible — **yes (20)**
16–17. Backend/frontend lint/build/tests — **yes**
18. Phase 2/3 logic untouched by dep upgrade — **yes** (no CAS/SQL/import code in Phase 4 patch)
19. Audit after documented — **yes**
20. Quality gates not lowered — **yes**
21. Override justified — **yes**
22. No unnecessary new deps — **yes**
23. No caches committed — **yes**

---

## Follow-ups (optional, not Phase 4 blockers)

- Add Dependabot/Renovate for backend + root.
- Re-run `gcs:pilot:absence-attachments` in an ADC-enabled environment.
- Remove `uuid` override when Google SDK parents bump.
- Optional SBOM generation in CI.
