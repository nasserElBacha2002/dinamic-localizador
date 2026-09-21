# Phase 4E — Residual risks

## Session / auth wording (LOC-P1-015 reconciliation)

| Item | Status |
|------|--------|
| Original LOC-P1-015 (no logout / stolen JWT until expiry) | **REMEDIATED** via `token_version` + server logout + live DB identity |
| Broader refresh-token / session-table architecture | **RESIDUAL** — do not reopen LOC-P1-015 |
| CQ-004 JWT in `localStorage` | **RESIDUAL** |

## P1

| ID | Risk | Status |
|----|------|--------|
| LOC-P1-005 | Device GPS spoofing within geofence | **ACCEPTED_RESIDUAL** — no crypto proof of presence |
| Multi-company Twilio To routing | Ambiguous company if multiple actives share number heuristic | **ACCEPTED_RESIDUAL** — documented TODO phase-1.7 |

## P2

| ID | Risk | Status |
|----|------|--------|
| LOC-P1-003 / GET preview | Token in query / browser history for deep-links | **ACCEPTED_RESIDUAL** while GET retained; access logs redact |
| LOC-P1-007 | Retained deprecated surfaces increase attack surface slightly | **DEFERRED** removal until traffic proof |
| Strict CSP | Not enforced on API/SPA | **DEFERRED** — needs frontend asset inventory |
| HSTS in app | May be proxy-owned | **NOT_APPLICABLE** until TLS ownership verified |

## P3

| Risk | Status |
|------|--------|
| Console.info volume on Twilio signature start | Operational noise — no secrets |
| Impossible-travel heuristics not implemented | **ACCEPTED** — avoid false positives |

## Blocking residuals

None identified for closing Phase 4E.
