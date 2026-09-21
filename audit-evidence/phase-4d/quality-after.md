# Phase 4D — Quality after (review corrections)

## Remediations landed

| Area | Change |
|------|--------|
| Duplicate-key | `matchesDuplicateKeyConstraint` is **exact** (`extracted === name`); fallback only quoted `'Name'` / `` `Name` `` |
| Legacy attendance | Explicit enum of inventory + bare workday_active indexes (migration 002 / pre-039) |
| Live SQL | Integration test against `UQ_companies_name` via mssql |

## Metrics (cumulative 4D)

| Metric | Count |
|--------|------:|
| Unsafe casts removed (Twilio) | 4 |
| Exact constraint matcher | YES |
| Prefix false-positive | FIXED |
| SQL integration executed | YES (PASS) |

## Behavior notes

- Overlapping names (`UQ_test` vs `UQ_test_archived`) no longer match.
- Legacy active attendance no longer relies on generic prefix matching of `_real`/`_simulation`.
- Absence `UQ_absence_requests_source_message_sid` and Twilio helpers unchanged in this correction.
