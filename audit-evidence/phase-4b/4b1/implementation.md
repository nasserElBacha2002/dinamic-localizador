# 4B.1 — Implementation

Reused `withDedicatedSessionAppLock` (`sp_getapplock`, Session, `lockTimeoutMs=0`) for:

- `RECURRING_WORKDAY_MATERIALIZATION_LOCK_RESOURCE`
- `ATTENDANCE_REMINDER_JOB_LOCK_RESOURCE`

`recurringWorkdayMaterializationService.runScheduledTick()` holds the lease; job layer has no process-local `isRunning`.

Attendance reminder wraps the tick; per-notification claim remains the side-effect idempotency layer.
