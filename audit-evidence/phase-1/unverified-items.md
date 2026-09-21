# Unverified items (static analysis limits)

| ID | Topic | Why unverified | Suggested Phase-2 |
|----|-------|----------------|-------------------|
| UV-01 | Full IDOR matrix all 241 handlers | Call-graph sampling ≠ exhaustive | DAST authz suite |
| UV-02 | SSRF via outbound URL configs | Outbound clients not fully mapped | SAST + config review |
| UV-03 | Frontend XSS | Not deep-audited | Semgrep + browser DAST |
| UV-04 | Formula injection CSV/XLSX exports | Export builders sampled lightly | Targeted tests |
| UV-05 | Upload MIME/path for payroll/absence attachments | Surface identified; deep review pending | File abuse cases |
| UV-06 | Branch protection / GitHub org settings | Not visible from repo alone | Org audit |
| UV-07 | Production runtime flags (Twilio validate, compose files actually used) | Deploy host not inspected | Ops confirmation |
| UV-08 | Race on POST /attendance check-then-act | Unique constraints may save; not proven under load | Concurrency test |
| UV-09 | Supply-chain CVE depth | npm audit script exists; full lockfile CVE not re-run here | osv/trivy Phase-2 |
| UV-10 | Email/SMTP injection | Not fully traced | SAST |

| UV-11 | Frontend JWT storage (localStorage vs memory) | Not re-verified in this follow-up | FE storage + XSS impact |
| UV-12 | Whether production always uses docker-compose.prod.yml | Deploy host not inspected | Ops attestation |
| UV-13 | Exhaustive BFLA (permission vs role vertical) matrix | Sampled permissions only | DAST AuthZ suites |
