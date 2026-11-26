# Event ledger — round 2

## Fixes

- Rejection evaluations preserved: evaluate before `throwIfAdmissionBlocked`, flush with `mutationPersisted=false` after rollback.
- ENFORCE success: `ALLOWED` / `SKIPPED` / `INCONSISTENCY` recorded when `mutationPersisted=true`.
- `capacity_kind` persisted; `is_exempt` / `enforce_seat_limit` nullable (unknown vs explicit).
- Autonomous insert durability gap documented on `flushAdmissionEvaluation`.

## Tests

| Scenario | Command | Result |
|----------|---------|--------|
| Unit mode matrix | `npx tsx --test resolve-effective-commercial-seat-mode.test.ts` | pass |
| REJECTED + active count + single event | `commercial-seat-quota.integration.test.ts` | **not run** (integration provision failed) |