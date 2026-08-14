# Historical operation seed (dev/test)

Synthetic but coherent past operations for exercising the Recommendation Engine (affinity, service experience, recency).

**Only for controlled non-production environments.** Never run against production data.

## Safety

- Requires `--company-id <uuid>` (never all companies).
- Refuses `NODE_ENV=production`.
- Requires `ALLOW_SYNTHETIC_OPERATION_SEED=true`.
- Excludes employees whose name contains `cycle integration` (case-insensitive).
- Does **not** call assignment/WhatsApp services — direct SQL inserts only.
- Does **not** modify existing employees, services, or real work teams.
- Tags all synthetic rows with `[AI_HISTORY_SEED:<batchId>]` for selective cleanup.

## Commands

```bash
cd backend
export ALLOW_SYNTHETIC_OPERATION_SEED=true

# Preview (no writes)
npm run seed:historical-operations -- \
  --company-id "<uuid>" \
  --operations 100 \
  --months-back 12 \
  --seed 20260814 \
  --dry-run

# Execute
npm run seed:historical-operations -- \
  --company-id "<uuid>" \
  --operations 100 \
  --months-back 12 \
  --seed 20260814

# Cleanup preview / execute
npm run seed:historical-operations -- \
  --company-id "<uuid>" \
  --cleanup ai-history-20260814-a12c \
  --dry-run

npm run seed:historical-operations -- \
  --company-id "<uuid>" \
  --cleanup ai-history-20260814-a12c
```

Optional: `--batch-id <id>` for a stable marker (duplicate batch aborts until cleanup).

Defaults: `operations=100`, `months-back=12`.

## What it creates

- Completed `ONE_TIME` `scheduled_operations` (past dates only)
- `operation_workdays` (ACTIVE)
- `operation_assignments` (CONFIRMED, MANUAL or WORK_TEAM)
- `employee_workdays` (EXPECTED)
- `attendance_records` (geo + punctuality via real validators; `source_message_sid` null)
- Synthetic `work_teams` + members (reusable across ops; marked in description)

## Algorithm (short)

1. Form 2–3 employee clusters with favorite services.
2. ~70% ops from one cluster, ~20% cross-cluster, ~10% random mix.
3. ~35% assignments via synthetic work teams.
4. Date windows biased to recent / mid / older history for recency tests.
5. Deterministic PRNG from `--seed`.

## Cleanup

Deletes only rows tagged with the batch marker (attendance → employee_workdays → assignments → workdays → operations → team members → teams). Employees and services remain.

## Risks

- Large `--operations` increases DB volume; keep ≤500.
- Same seed with a new batch id creates another dataset (not idempotent unless `--batch-id` is reused — then abort).
- Do not point at shared staging without cleanup discipline.
