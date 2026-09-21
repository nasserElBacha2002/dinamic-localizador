# Phase 4E — Hardening baseline

Date: 2026-09-21  
Scope: residual security hardening after 4A–4D (no Phase 5 DAST/SAST).

## Starting posture (inventory)

| Area | Pre-4E state |
|------|----------------|
| Log redaction | `log-redaction.ts` + access logger `:safe-url`; system-logs sanitize |
| CORS | Explicit allowlist via `parseCorsOrigins`; missing Origin allowed |
| Legacy routes | GET invitation preview DEPRECATED; `/workers` alias; balance PUT Sunset |
| Twilio | Signature middleware + SDK validation; MessageSid claim + payload anomaly |
| Location | Server-authoritative (4A); client derived fields ignored |
| Headers | helmet + referrerPolicy no-referrer |
| Error boundary | AppError/Zod/safe 500 message |
| Observability | system logs + console security-ish events (partial codes) |

## 4E goals

1. Close logging gaps (object/header sanitizers + tests).
2. Formalize CORS with HTTP tests (LOC-P1-006).
3. Inventory legacy surface + auth parity evidence (LOC-P1-007).
4. Confirm Twilio signature/replay posture + document company residual.
5. Honest GPS spoofing residual (LOC-P1-005) — no fake antifraud.
6. Security event catalog + runbook + Phase 5 retest matrix.

## Non-goals

- Auth rewrite / cookie migration
- Complex antifraud / fingerprinting
- Blind API deletion
- New SIEM
- Full Phase 5 retest
