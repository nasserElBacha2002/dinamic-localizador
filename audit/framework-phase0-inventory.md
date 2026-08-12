# Phase 0 — Inventory of the existing audit system (pre-framework)

## Commands (root package.json)

| Command | Behavior |
|---|---|
| `npm run audit` | Full diagnostic pipeline via `run_full_audit.sh` (exit 0) |
| `npm run audit:strict` | Same + `enforce_quality_gate.py --strict` |
| `npm run audit:summary` | Aggregate raw → `audit-summary.md` / `audit-status.json` |
| `npm run audit:baseline` | Copy status (+ findings) into `audit/baseline/` |
| `npm run audit:security:fast` | Secrets/env/docker/npm audit high+ |
| `npm run audit:security:deep` | Extended security script |

## Scripts

- Shell: `run_full_audit.sh`, backend/frontend quality + architecture, security fast/deep, `lib.sh`
- Python: summary, enrichment, secrets, env docs, SQL analysis, tenant isolation, quality gate, baseline
- Optional tools via npx: madge (cycles), jscpd (duplication), ts-prune (dead code)

## Gaps addressed by framework

- No normalized finding model across tools
- Architecture smells mostly LOC/grep heuristics without scored god-class evidence
- No baseline diff for individual findings / regression-focused gate
- SOLID/GRASP/patches/exception/reliability not covered systematically
- Thresholds scattered / hard-coded in shell

## Overlaps kept intentionally

- Existing SQL analysis + new SQL boundary inventory (complementary)
- Existing madge circular check + new layer-import heuristics
- Security secrets/env remain authoritative; framework adds tenant/SQL risk hints
