# Unresolved items

| ID | Item | Why open | Next |
|----|------|----------|------|
| U-01 | 118 matrix PARTIAL routes | Shared pattern assumed; repo not per-handler traced | DAST AuthZ + expand traces |
| U-02 | Full BFLA matrix every permission | Coarse absences:review intentional? | Product decision |
| U-03 | DNS rebinding residual on Twilio media | Pre-DNS check only | Optional harden |
| U-04 | Production Twilio/compose flags | Ops attestation | Phase 2 prep |
| U-05 | Exhaustive FE XSS via markdown libs | No sinks found; deps not deep-scanned | Semgrep Phase 2 |
| U-06 | Reliability scanner 0 hits | High FN | Do not trust |
| U-07 | N+1 / perf pathologies | Not fully scanned | Opportunistic |
