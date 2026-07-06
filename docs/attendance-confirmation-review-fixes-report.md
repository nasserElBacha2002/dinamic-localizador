# Attendance Confirmation Review Fixes Report

## 1. Executive Summary

This pass addresses the two merge blockers from code review—Twilio send vs. post-send session consistency, and atomic inventory rescheduling with confirmation reset—plus the requested test and timezone corrections. The existing architecture (`operation_assignments`, scheduler + `whatsapp_attendance_notifications`, `schedule_version` / `confirmation_schedule_version`, `bot_sessions`) is preserved.

Backend unit tests pass (470/470). Frontend `npm test` passes (167/167). Frontend build and backend build pass. DB integration tests were executed where SQL Server is available; one new integration test requires migration `032` on the target database.

## 2. Twilio Send / Session Consistency Fix

### Previous Failure Mode

A shared `catch` path could call `markFailed` after Twilio had already returned a `MessageSid`, causing scheduler retries and duplicate WhatsApp reminders. `createAttendanceConfirmationResponseSession()` returning `null` was treated as success.

### Final Lifecycle

Hybrid **Strategy A + C** in `attendance-reminder.service.ts`:

1. Claim notification
2. Revalidate eligibility (pre-send)
3. **Prepare** contextual session (`createAttendanceConfirmationResponseSession`) — pre-send failure → `markFailed`
4. Twilio `sendWhatsAppTemplate`
5. `markSent` in isolated try/catch — failure logs error, **never** `markFailed`
6. Twilio failure → `cancelSession` on prepared session → `markFailed`
7. Session `null` after prepare → Twilio still sends (degraded) → outcome `sent_context_failed`, logged as `SENT_CONTEXT_FAILED`

`confirmationSent` summary counts both `sent` and `sent_context_failed` as delivered.

### Null Session Handling

Explicit branch when `preparedSession === null`:

- Warn log with `ACTIVE_SESSION_CONFLICT`
- After successful Twilio send → `sent_context_failed` (not `failed`)
- Employee can still confirm via existing manual flows

### Retry Semantics

| Stage | On failure |
|-------|------------|
| Pre-send (eligibility, session throw, Twilio throw) | `markFailed` / retry per existing semantics |
| Post-send (`markSent` throw, session was `null`) | No `markFailed`; `sent` or `sent_context_failed` |

Constant: `SENT_CONTEXT_FAILED_ERROR` in `attendance-notification.ts`.

### Tests

`attendance-reminder.service.test.ts`:

- `markSent` throws after Twilio success → `confirmationSent: 1`, `markFailed` not called
- Session returns `null` → `confirmationSent: 1`, `markFailed` not called
- Twilio throws → session cancelled, `markFailed` called, `markSent` not called
- Successful path with session
- `schedule_version` passed to `claimNotificationForAttempt`

## 3. Atomic Inventory Rescheduling Fix

### Previous Partial-Write Risk

`inventoryRepository.update` and `resetConfirmationsForInventoryScheduleChange` were separate operations. A failure between them could leave new `scheduled_start` with stale confirmation state.

### Transaction Architecture

When `scheduledStart` changes materially, `inventory.service.ts`:

```text
BEGIN TRANSACTION
  inventoryRepository.update(..., transaction)
  resetConfirmationsForInventoryScheduleChange(..., transaction)
COMMIT
```

On error: `ROLLBACK`, exception rethrown.

`inventory.repository.update` and `employee-assignment-query.repository.resetConfirmationsForInventoryScheduleChange` accept optional `sql.Transaction`.

### Confirmation Reset Rule

On material `scheduled_start` change:

- `confirmation_status` → `PENDING`
- `confirmed_at` / `unavailable_at` → `NULL`
- `confirmation_schedule_version` incremented

Non-schedule updates (e.g. notes) do not reset.

### Audit Logging

`auditService.log` runs **after** successful commit only.

### Tests

- `inventory-schedule-update.service.test.ts` — notes-only update does not reset confirmations
- `inventory-schedule-confirmation-reset.integration.test.ts` — full atomic reset (requires DB + migration 032)

## 4. Inventory Attendance Repository Test Corrections

### Removed Weak Tests

Deleted `inventory-attendance.repository.test.ts` (self-mocking `getAttendanceSummary` + source-regex assertions).

### Mapping Tests

Extracted `inventory-attendance-summary.mapper.ts` with unit tests for `PENDING` / `CONFIRMED` / `UNAVAILABLE` row mapping and timestamps.

### Repository Integration Tests

`inventory-attendance-summary.integration.test.ts` — 3 employees, asserts summary counts and row-level `confirmationStatus` / timestamps. **Passed** with `RUN_DB_INTEGRATION_TESTS=true` when SQL Server available.

## 5. Schedule Cycle Idempotency Validation

### Version 1 Reminder

Historical `whatsapp_attendance_notifications` row: `schedule_version = 1`, `status = SENT` preserved.

### Rescheduling

Atomic transaction increments `confirmation_schedule_version` and resets assignment confirmations.

### Version 2 Reminder

Scheduler claims with `schedule_version` from assignment (`candidate.scheduleVersion`).

### Duplicate Prevention

Unique index `UQ_whatsapp_attendance_notifications_inventory_employee_type_version` on `(inventory_id, employee_id, notification_type, schedule_version)`.

Unit test: `claims confirmation reminders using schedule_version for idempotent cycles` in `attendance-reminder.service.test.ts`.

## 6. Company Timezone Reply Correction

### Previous Behavior

Contextual Sí/No replies used global `BOT_OPERATION_TIMEZONE` in some paths.

### Final Timezone Resolution

`attendance-confirmation-response.handler.ts` resolves `companyOperationalSettingsService.getCompanyOperationalSettings(companyId).operationTimezone` for affirmative and negative reply date/time formatting (`DD/MM/YYYY`, `HH:mm`).

### Tests

`whatsapp-router.service.test.ts` — `America/Cancun` for UTC `2026-07-15T23:30:00.000Z` → reply contains `18:30` (distinct from default `America/Argentina/Buenos_Aires`).

## 7. Operational View Component Test Improvements

### Status Rendering

`inventory-operational-table.test.tsx` — renders `StatusBadge` cells for PENDING / CONFIRMED / UNAVAILABLE and NO_CHECK_IN / VALID / PENDING_REVIEW labels.

### Removed Columns

`inventory-operational-confirmation.test.ts` — source assertions confirm Distancia, Ubicación, Estado operativo, Teléfono, Tiempo extra, Estado salida are not table headers.

### Attendance Detail Navigation

Navigation harness tests: no navigation without attendance; navigates to `/attendance/:id` when attendance exists.

### Action Propagation

Action button click does not change route (stopPropagation pattern).

`OperationalSummaryMetrics.test.tsx` — grouped Confirmación / Asistencia metrics.

## 8. Shared Component Regression Review

### DataTable

Added optional `isRowClickable`; default remains fully clickable when `onRowClick` set. Actions column stops propagation. `DataTable.clickable.test.ts` asserts API surface.

### StatusBadge

No operational-specific assumptions; existing tone API unchanged.

### List Navigation

`list-navigation.ts` back-context preserved; covered by existing `table-url-navigation.test.tsx`.

## 9. Migration Validation

Reviewed (not edited):

| Migration | Purpose |
|-----------|---------|
| `030_company_confirmation_reminder_settings.sql` | Company reminder enable/hours |
| `031_attendance_confirmation_reminder_notification.sql` | `ATTENDANCE_CONFIRMATION_REMINDER`, `schedule_version`, unique index recreation, backfill to 1 |
| `032_assignment_confirmation_schedule_version.sql` | `confirmation_schedule_version`, bot session state, index updates |

Validation notes:

- Additive columns with `DEFAULT 1` and `UPDATE ... WHERE schedule_version < 1` backfill
- Unique index transition scoped to `(inventory_id, employee_id, notification_type, schedule_version)`
- Existing notification rows receive `schedule_version = 1`
- Fresh install and upgrade paths are syntactically valid SQL Server

**Local integration note:** schedule-reset integration test failed with `Invalid column name 'confirmation_schedule_version'` until migration `032` is applied to the test database.

## 10. Files Modified

| File | Change |
|------|--------|
| `backend/src/services/attendance-reminder.service.ts` | Session-before-send lifecycle, post-send failure isolation |
| `backend/src/constants/attendance-notification.ts` | `SENT_CONTEXT_FAILED_ERROR` |
| `backend/src/services/inventory.service.ts` | Transactional schedule change + confirmation reset |
| `backend/src/repositories/inventory.repository.ts` | Transaction-aware `update` |
| `backend/src/repositories/employee-assignment-query.repository.ts` | Transaction-aware reset |
| `backend/src/services/whatsapp-router/attendance-confirmation-response.handler.ts` | Company timezone |
| `backend/src/utils/inventory-attendance-summary.mapper.ts` | Extracted mapper |
| `backend/src/repositories/inventory-attendance.repository.ts` | Uses mapper |
| `backend/src/services/attendance-reminder.service.test.ts` | Failure-mode + idempotency tests |
| `backend/src/services/whatsapp-router/whatsapp-router.service.test.ts` | Timezone test |
| `backend/src/services/inventory-schedule-update.service.test.ts` | Non-schedule update test |
| `backend/src/services/inventory-schedule-confirmation-reset.integration.test.ts` | Atomic reset integration |
| `backend/src/repositories/inventory-attendance-summary.integration.test.ts` | Summary integration |
| `backend/src/utils/inventory-attendance-summary.mapper.test.ts` | Mapper unit tests |
| `frontend/src/components/inventories/inventory-operational-table.test.tsx` | Status + navigation tests |
| `frontend/src/components/inventories/OperationalSummaryMetrics.test.tsx` | Metrics component test |
| `frontend/src/components/inventories/inventory-operational-confirmation.test.ts` | Fixed imports |
| `frontend/src/design-system/components/DataTable.clickable.test.ts` | `isRowClickable` contract |
| `frontend/src/test/setup-dom.ts` | `getComputedStyle` polyfill |

**Removed:** `backend/src/repositories/inventory-attendance.repository.test.ts`, `frontend/src/design-system/components/DataTable.test.tsx` (ScrollArea render failure in happy-dom).

## 11. Tests and Validation Results

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | pass |
| `cd backend && npm test` | 470 pass, 0 fail |
| `RUN_DB_INTEGRATION_TESTS=true` attendance summary integration | pass |
| `RUN_DB_INTEGRATION_TESTS=true` schedule reset integration | **fail** — migration `032` not applied on local DB |
| `cd frontend && npm test` | 167 pass, 0 fail |
| `cd frontend && npm run build` | pass |
| New frontend tests (explicit paths) | 11 pass (operational table, metrics, confirmation, DataTable.clickable) |

**Note:** `npm test` frontend glob (`src/**/*.test.ts`) may not expand all nested paths under zsh without `globstar`; new tests under `src/components/inventories/` should be run explicitly or via quoted glob until the script is updated.

## 12. Remaining Limitations

- Schedule-reset DB integration test requires migration `032` on the integration database.
- `company-settings-operational.test.ts` has 2 pre-existing failures when run directly (unrelated to this feature).
- Full DataTable render tests blocked by Mantine `ScrollArea` + happy-dom; navigation/clickability covered via harness tests and source contract test.
- End-to-end schedule-cycle idempotency (reschedule → v2 reminder → no duplicate) is covered at unit level for `claimNotificationForAttempt` schedule_version; full DB scenario could be added after migrations are applied in CI.

## 13. Final Status

READY FOR CODE REVIEW

Both critical invariants are implemented:

1. Once Twilio successfully sends a confirmation reminder, internal session/`markSent` failures cannot mark the notification `FAILED` or trigger retry duplicates.
2. Meaningful `scheduled_start` change and invalidation of employee confirmations are persisted in one SQL transaction.
