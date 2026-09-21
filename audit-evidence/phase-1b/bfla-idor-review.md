# BFLA / IDOR review

## BFLA

| Case | Evidence | Classification |
|------|----------|----------------|
| SUPERVISOR `attendance:review` → POST create with client VALID statuses | LOC-P1-002 | DEFECTO_CONFIRMADO (security/business) |
| Platform admin → synthetic OWNER on any company | `platform-admin-membership.ts` | RIESGO_PROBABLE / trust boundary (LOC-P1-014) |
| `absences:review` used for create + approve + reject | `absence-request.routes.ts` | Likely intentional; document as coarse permission |
| FE users page requires `users:manage`; BE list also allows `company:settings:update` | FE stricter | Not BFLA (FE cannot weaken BE) |

## IDOR / BOLA

Traced `:id` handlers for attendance, employees, operations, absences, payroll, drafts, attachments → company filter in SQL.

**No company-user IDOR confirmed** for WhatsApp `findByIdGlobal` (platform-only).

Invitation revoke/resend: unscoped repo + service company check → PARTIAL (race/misuse still blocked by service).

## Variant analysis

See `variant-analysis.md` VA-B1…B4.
