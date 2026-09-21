# Phase 4A — Implementation Corrections Summary

## Decisiones tomadas

1. **Authoritative punctuality (LOC-P1-002)**  
   REST `attendanceService.create` uses `attendanceAuthoritativeClock.now()` for classification and persistence of `receivedAt`. Client `receivedAt` is validated as parseable evidence only and logged as `clientReportedReceivedAt` — never used for EARLY/ON_TIME/LATE/OUTSIDE_TIME_WINDOW.

2. **Legacy payload compatibility**  
   `createAttendanceSchema` accepts deprecated derived fields (`distanceMeters`, `validationStatus`, `locationStatus`, `punctualityStatus`, `validationReason`) then strips them. Server recomputes all derived state. Deprecation plan: later phase can re-introduce `.strict()` after clients migrate. Sanitized console metric when legacy fields appear.

3. **Shared check-in primitive**  
   Extracted `evaluateAttendanceCheckIn` in `backend/src/utils/evaluate-attendance-check-in.ts`. REST uses it directly; WhatsApp/Bot keep `buildCheckInValidation` as a thin adapter (Twilio/event clock remains trusted for bot flows). No attendance→bot-runtime dummy settings coupling.

4. **Invitation token (LOC-P1-003 / 012)**  
   POST `/preview` preferred; GET `/preview` kept **DEPRECATED** for older clients. Access logger uses `:safe-url` redaction. Residual risk: email deep-link still places token in browser URL/history/Referer.

5. **Distributed rate limit (LOC-P1-001)**  
   SQL backend default outside tests. Readiness probes `dbo.rate_limit_buckets` when backend=sql (opaque 503 if missing). Cleanup job uses session `sp_getapplock` (no process-local `isRunning`). Production blocks `RATE_LIMIT_BACKEND=memory` unless `RATE_LIMIT_ALLOW_MEMORY_IN_PRODUCTION=true`.

6. **Geofence single snapshot (CQ-001–003)**  
   `geofencePolicyResolver.resolveFromSettings` derives policy from an already-loaded settings row. `botRuntimeSettingsService` loads company settings once and derives operational + geofence margin from that snapshot. Repository errors fail closed.

## Compatibilidad / deployment strategy

```
migration 140 → verify /health/ready → roll out backend replicas → clients may still send legacy derived fields (ignored) → later deprecation phase may strict-reject
```

Backend new + frontend old: **compatible** (legacy fields accepted+ignored).  
Frontend new + backend old: still broken until backend is rolled first (expected — roll backend first).

## Migrations

- `140_rate_limit_buckets.sql` — additive table + index on `expires_at_utc`
- `rollback/140_rate_limit_buckets.sql` — DROP TABLE (not executed in this validation)
- Forward re-application: skipped by migration framework after first apply
- Local validation applied pending `138`, `139`, then `140`

## Tests ejecutados

See `implementation-corrections-tests.txt`.

Highlights:
- Authoritative time / legacy strip / far+inside location
- Manual permission gates (authorized vs forbidden)
- Invitation POST/GET schemas, expired/accepted preview → INVALID, access-log redaction
- Geofence cross-flow REST/Bot/Simulator observable equivalence + fail-closed
- SQL multi-replica rate-limit integration (6/6)

## Riesgos residuales

| Risk | Severity | Notes |
|------|----------|-------|
| Email/browser URL still carries invitation token | P2 residual | Deep-link UX requires it; API POST avoids repeat query logging |
| GET `/invitations/preview` still available | Low | Deprecated; redacted in access logs |
| Accept replay covered via preview + service code path | Low | Accept uses `findByTokenHashForUpdate` + INVITATION_INVALID when not PENDING |
| Full HTTP→SQL attendance create integration | Low | Schema→service→repo covered in unit; manual attendance SQL integration pre-exists |
| Rollback 140 not executed on shared DB | Ops | Destructive; file present for deploy runbooks |

## Validaciones no ejecutables / N/A

- Dedicated `typecheck` scripts: not present; covered by backend/frontend `build`
- Destructive rollback of 140 against shared DB: intentionally skipped
