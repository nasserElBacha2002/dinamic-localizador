# Discarded hypotheses

| Hypothesis | Investigation | Verdict |
|------------|---------------|---------|
| Stack traces returned to clients | `error-handler.ts` returns generic 500 JSON without `error.stack` | DESCARTADO |
| `findByIdGlobal` IDOR for company users | Only platform observability + internal traces; company routes use scoped findById | DESCARTADO as company IDOR |
| Empty TWILIO_AUTH_TOKEN bypasses signature when validation enabled | Returns `TWILIO_SIGNATURE_CONFIG_MISSING` / fail closed | DESCARTADO |
| Invitation tokens predictable | `randomBytes(32)` opaque tokens | DESCARTADO |
| Invitation accept email enumeration | Uniform INVALID/404 patterns + rate limit | DESCARTADO (as oracle) |
| Location MessageSid replay | Unique indexes + webhook claim/idempotency | DESCARTADO (given signature) |
| Dual-mount authz asymmetry on shared ops routers | Same router + requirePermission; legacy lacks users/invites mounts only | DESCARTADO as authz bypass |
| Core employee/attendance repos missing company_id on user paths | Sampled queries include companyId | DESCARTADO for sampled set (not proof of all tables) |
| SQL injection via string-concat user input | Dynamic WHERE from fixed fragments + `.input()` params | DESCARTADO for sampled list filters |
| Manual attendance client status mass-assignment | Manual schema omits status enums | DESCARTADO |
| Error handler fail-open auth | Unhandled → 500; AppError preserves status | DESCARTADO |
| CORS allows Origin literal `null` | `"null"` is truthy; only missing origin allowed | DESCARTADO for null-origin bypass |

| Hypothesis | Investigation | Verdict |
|------------|---------------|---------|
| Logout endpoint exists but hidden | Grep of `backend/src/routes` for logout/refresh — zero matches | DESCARTADO (absence is real; filed as LOC-P1-015) |
