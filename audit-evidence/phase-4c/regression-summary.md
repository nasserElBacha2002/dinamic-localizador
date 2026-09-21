# Phase 4C — Regression summary

## Sources (measured / evidence files — not recalled)

| Milestone | Source | Backend unit | Unit files | Frontend |
|-----------|--------|--------------|------------|----------|
| 4B initial | `phase-4b-complete-tests.txt` note | **1941** (prior report) | — | — |
| 4B review-corrections | `phase-4b-complete-tests.txt` / `implementation-corrections-tests.txt` | **1935** pass / 0 fail | **351** | **842** pass / 0 fail |
| 4C first pass | `phase-4c-architecture-tests.txt` | **1945** pass / 0 fail | **352** | **843** pass / 0 fail |
| 4C review corrections | this run (`npm test` → file) | **1950** pass / 0 fail | **353** | **821** pass / 0 fail |

## 4C tests added / removed (static source count — authoritative for arithmetic)

| Item | Count |
|------|------:|
| `checkout-architecture.characterization.test.ts` `it()` | +8 |
| `checkout-attendance.flow.characterization.test.ts` `it()` | +4 |
| **Total 4C `it()` added** | **+12** |
| **4C `it()` / test files removed** | **0** (verified: no deleted unit tests in 4C scope) |
| Unit files: 4B → 4C final | 351 → 353 (+2) |

Static expectation from 4B review: `1935 TAP ≠ exact it()-count`, but file math closes:

```text
351 files + 2 new characterization files = 353
0 test files removed
+12 it() added in those two files
```

## TAP total note (harness)

Backend/frontend `npm test` use `--test-force-exit`. Across repeated green runs, TAP `# tests` / `# suites` fluctuate (e.g. backend 1929–1974, frontend 819–843) while **exit code 0 and `# fail 0` remain stable**. This is pre-existing harness behavior, not a 4C behavior regression.

Latest recorded TAP (review corrections):

- Backend: **1950 pass / 0 fail / 353 files**
- Frontend: **821 pass / 0 fail** (no frontend code changes in 4C)
- Characterization (helpers + flow, no force-exit): **12 pass / 0 fail**

## Invariants

- 4A / 4B modules not reopened for behavior changes
- Public API / DB unchanged
- Characterization helpers + flow wiring: green
