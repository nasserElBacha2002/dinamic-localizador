# Variant analysis

## VA-01 — In-memory rate limit (LOC-P1-001)

**Search pattern:** `createRateLimiter|rateLimitInvitations|new Map<string, Bucket>`

| Location | Result |
|----------|--------|
| `middleware/rate-limit.ts` | Root implementation |
| `routes/auth.routes.ts` | login, 2FA, forgot, reset |
| `middleware/rate-limit-invitations.ts` | invitation public flows |
| Other HTTP | Most API routes **not** rate-limited (by design / residual) |

**True positives:** All Map-based limiters share multi-instance weakness.  
**False positives:** None for shared-store claim.

## VA-02 — Client-supplied attendance status (LOC-P1-002)

**Search pattern:** `validationStatusSchema|createAttendanceSchema|manual-attendance.schema`

| Path | Client statuses? |
|------|------------------|
| `POST /attendance` + `createAttendanceSchema` | YES — defect |
| Manual create/edit schemas | NO — statuses server-derived |
| Review schema | APPROVE/REJECT only — OK |
| WhatsApp bot attendance creation | Server computes — OK (sampled) |

## VA-03 — Secrets in access logs (LOC-P1-003 / 012)

**Search pattern:** `morgan\(|previewInvitationQuerySchema|\?token=`

| Hit | Assessment |
|-----|------------|
| Invitation preview query token | TRUE POSITIVE |
| Password reset tokens | Typically body — lower risk; verify no query usage |
| Bearer Authorization | System logger sanitizes; morgan may still log path only |

## VA-04 — Job fencing (LOC-P1-004)

**Search pattern:** `let isRunning = false` in `backend/src/jobs/`

| Job | Extra fencing |
|-----|---------------|
| attendance-reminder | claimNotificationForAttempt (sampled) |
| operation-assignment-notification | DB leases |
| absence-workday-sync | DB leases |
| daily-attendance-report | lease repositories |
| system-log-retention | lease skip message |
| whatsapp-message-cost-sync | leaseLost |
| whatsapp-retention-cleanup | service locks (sampled) |
| company-deletion | service locks (sampled) |
| admin-alert | evaluation claim |
| operation-lifecycle | CAS promoteLifecycleStatus |
| **recurring-workday-materialization** | **process-local only (primary TP)** |
| **absence-attachment-cleanup** | **no lease in service (TP)** |
| payroll-receipt-notification | verify claim paths (partial) |

## VA-05 — Global ID lookups (LOC-P1-014)

**Search pattern:** `findByIdGlobal|WHERE id = @id` on whatsapp_messages/conversations

| Consumer | Authz |
|----------|-------|
| Platform observability | requirePlatformAdmin — intentional |
| Flow-trace internal | not company-user HTTP |
| Company-scoped `findById(companyId, id)` | OK |

No company-user IDOR confirmed for global finders.
