# Phase 1A validation

## Counts reconciliation (corrected in Phase 1B)

| Source | Count | HIGH | MEDIUM | LOW | INFO | DEFECTO_CONFIRMADO | RIESGO_PROBABLE |
|--------|------:|-----:|-------:|----:|-----:|-------------------:|----------------:|
| findings.csv | 15 | 3 | 4 | 5 | 3 | 10 | 5 |
| findings.md summary table | 15 | 3 | 4 | 5 | 3 | 10 | 5 |
| phase-1-final-report | aligned | — | — | — | — | — | — |

**Issue found:** `findings.md` previously showed Total **14** after LOC-P1-015 was added; corrected to **15** during Phase 1B.

## IDs present
- LOC-P1-001
- LOC-P1-002
- LOC-P1-003
- LOC-P1-004
- LOC-P1-005
- LOC-P1-006
- LOC-P1-007
- LOC-P1-008
- LOC-P1-009
- LOC-P1-010
- LOC-P1-011
- LOC-P1-012
- LOC-P1-013
- LOC-P1-014
- LOC-P1-015

## Reclassification (security vs non-security) — documentary only

| ID | Original presentation | Reclass type | Notes |
|----|----------------------|--------------|-------|
| LOC-P1-001 | Security | SECURITY / RELIABILITY | Auth rate limit multi-instance |
| LOC-P1-002 | Security | SECURITY / BUSINESS_INTEGRITY | Client-trusted attendance statuses |
| LOC-P1-003 | Security | SECURITY / LOGGING | Invitation token in logs |
| LOC-P1-004 | Security | RELIABILITY | Job fencing |
| LOC-P1-005 | Security | SECURITY (inherent+impl) | GPS spoof residual |
| LOC-P1-006 | Security | OPERATIONAL / CONFIG | CORS missing Origin |
| LOC-P1-007 | Security | ARCHITECTURE | Dual mounts surface |
| LOC-P1-008 | Security | AUDIT_READINESS | Tenant script gap |
| LOC-P1-009 | Security | OPERATIONAL | SQL port publish |
| LOC-P1-010 | Security | SECURITY / MISCONFIG | Twilio validate off |
| LOC-P1-011 | Security | PRIVACY | Preview email |
| LOC-P1-012 | Security | LOGGING | Morgan always-on |
| LOC-P1-013 | Security | AUDIT_READINESS | Missing security-audit.yaml |
| LOC-P1-014 | Security | TRUST_BOUNDARY | Platform admin OWNER |
| LOC-P1-015 | Security | AUTH_SESSION | No logout/refresh |

**Do not treat LOC-P1-008 / LOC-P1-013 as runtime vulnerabilities** — they are audit-program gaps.

## Residual from 1A still open for 1B
- Authorization UNKNOWN → closed via matrix
- Tenant PARTIAL → deepened
- XSS UNKNOWN → reviewed
- SSRF UNKNOWN → reviewed
