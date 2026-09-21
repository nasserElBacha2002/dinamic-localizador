# Audit scope — Phase 1 (dinamic-localizador)

## In scope

1. Reconstruct architecture and trust boundaries
2. Inventory HTTP endpoints and classify public surfaces
3. AuthN/AuthZ/tenant isolation adversary review (static + call sampling)
4. WhatsApp webhook, company resolution, MessageSid idempotency patterns
5. Attendance / geolocation / manual correction integrity (static)
6. Jobs/leases concurrency patterns (sampling)
7. Secrets/config/Docker/CI surface review (static)
8. Compare coverage vs Gemini methodology; define residual SAST/DAST prep
9. Produce reproducible evidence under `audit-evidence/phase-1/`

## Out of scope (explicit)

- Implementing remediations
- Running external SAST/DAST scanners (Semgrep/Trivy/gitleaks deep, active DAST)
- Mutating databases or deploying
- Full frontend XSS crawl
- Re-auditing dinamic-gemini product findings
- Assuming Gemini vulnerabilities exist here

## Acceptance of Phase-1 completeness

Phase-1 is complete when architecture, inventory, threat model, findings with evidence, variant analysis, and residual unverified list exist — **not** when the product is “secure”.
