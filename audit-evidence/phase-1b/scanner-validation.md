# Scanner validation

Raw outputs: `evidence/scanner-*.json`. Summary: `evidence/scanner-summary.json`.

| Scanner | Purpose | Raw count | Validated TP | FP / caveats | FN risk | Confidence |
|---------|---------|----------:|-------------:|--------------|---------|------------|
| architecture | Forbidden imports + fan-out | 2 | Review fan-out INFO | Critical import rules rare | Medium | MEDIUM |
| complexity | LOC + control-flow tokens | 16 | Large files real | Tokens ≠ cyclomatic | Nesting not measured | MEDIUM |
| dead_env | env vs .env.example | 3 | Spot-check | Compose/shell-only vars look unused | Undocumented reads | LOW–MED |
| exceptions | Empty/default catches | 27 | Some silent fallbacks | Intentional Result/null | Nested catch regex fails | MEDIUM |
| god_class | Multi-signal score | 27 | Top LOC services | Import count alone | Heuristic | MEDIUM |
| patches | TODO/FIXME/as any | 81 | Inventory only | TODO≠defect | — | LOW |
| reliability | Webhook/lease/CTA | 0 | 0 this run | Path heuristics often FP when rules miss | High FN if naming differs | LOW |
| solid_grasp | SRP/OCP/LSP/DIP heuristics | 18 | Orchestration services | Always flags multi-domain | Over-flag | LOW–MED |
| sql_boundaries | SQL layer + `${}` | 103 | Static fragments INFO | Many MEDIUM `${where}` safe | Dynamic misuse | MEDIUM |

**Policy:** Scanner PASS ≠ secure. Scanner DETECTED ≠ finding without manual verification.
