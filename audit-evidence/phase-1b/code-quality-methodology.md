# Code quality methodology

1. Inventory Phase 1A findings and reclassify types.
2. Run internal `scripts/audit/framework/scanners/*` read-only → `evidence/scanner-*.json`.
3. Manually validate high-severity / high-impact scanner hits (do not auto-promote).
4. Targeted adversarial review: SOLID/GRASP, god modules, duplication of domain rules, async/TX, frontend XSS, SSRF.
5. Record CQ findings only with concrete consequence.
6. Separate CODE_SMELL / ARCHITECTURAL_DEBT / CORRECTNESS_DEFECT / SECURITY_DEFECT.
