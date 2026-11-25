# Event ledger validation (DIN-463 corrections)

## Changes

- Removed `recordPersistedAdmission` synthetic replay.
- `CommercialSeatAdmissionEvaluation` carried through employee mutations; flushed post-commit/rollback.
- `mutationPersisted` column set from flush argument.
- Nullable `active_count_before` / `projected_count` when not evaluated.
- Recording: OBSERVE mode (all decisions), ENFORCE failures (`REJECTED`, `EVALUATION_ERROR`, `INCONSISTENCY`, `WOULD_EXCEED`).

## Automated verification

| Command | Result |
|---------|--------|
| `npm run build` | pass |
| Ledger row assertions in integration tests | **skipped** (no SQL session) |