/**
 * System runtime logs (Platform Admin Observability)
 *
 * Technical logs are independent from WhatsApp functional observability,
 * Twilio provider events, messaging costs, audit_logs, and infra metrics.
 *
 * ## Architecture
 * - stdout: one JSON line per event (`schemaVersion: 1`)
 * - SQL sink (fail-open queue): persists ERROR/WARN + allowlisted INFO
 * - API: `/api/platform/observability/system-logs` (authenticate + requirePlatformAdmin)
 * - UI: `/platform/observability/system-logs` (VITE_SYSTEM_LOGS_UI_ENABLED)
 *
 * ## Configuration
 * | Variable | Default | Purpose |
 * |---|---|---|
 * | SYSTEM_LOGS_ENABLED | true | Master switch for SQL persistence |
 * | SYSTEM_LOGS_UI_ENABLED | true | API/UI gate |
 * | SYSTEM_LOGS_PERSIST_LEVELS | error,warn | Levels eligible for SQL |
 * | SYSTEM_LOGS_INFO_EVENT_ALLOWLIST | (see env.example) | INFO events that may persist |
 * | SYSTEM_LOGS_RETENTION_DAYS | 30 | Deletion cutoff |
 * | SYSTEM_LOGS_RETENTION_BATCH_SIZE | 500 | Batch delete size |
 * | SYSTEM_LOGS_QUERY_MAX_DAYS | 7 | Max list/query window |
 * | SYSTEM_LOGS_MAX_METADATA_BYTES | 8000 | Metadata cap |
 * | SYSTEM_LOGS_MAX_STACK_BYTES | 8000 | Stack cap |
 * | VITE_SYSTEM_LOGS_UI_ENABLED | true | Frontend nav/page gate |
 *
 * ## Security
 * - Platform Admin only (`users.is_platform_admin`)
 * - Central sanitizer redacts secrets, masks phones/emails, strips coordinates
 * - Free-text `q` matches message/event/module only (bounded LIKE, wildcards stripped)
 * - No Docker socket / Engine API / Loki / mass export
 *
 * ## Local diagnosis without SSH
 * 1. Trigger an error (invalid API call as authenticated user, or run a job that fails).
 * 2. Confirm JSON lines on backend stdout.
 * 3. Open **Logs del sistema** as Platform Admin and filter by request ID / module.
 *
 * ## Tests
 * - Unit: `backend/src/utils/system-logs/*.test.ts`
 * - Integration: `backend/src/routes/system-logs.integration.test.ts`
 * - Frontend: `SystemLogsPage.test.tsx`
 *
 * Seed helper for unit/integration: insert into `system_runtime_logs` directly
 * (see integration test). Do not enable production simulation endpoints.
 */
