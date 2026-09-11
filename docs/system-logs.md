/**
 * System runtime logs (Platform Admin Observability)
 *
 * Technical logs are independent from WhatsApp functional observability,
 * Twilio provider events, messaging costs, audit_logs, and infra metrics.
 *
 * ## Architecture
 * - stdout: one JSON line per event (`schemaVersion: 1`)
 * - SQL sink (fail-open bounded queue): persists ERROR/WARN + allowlisted INFO
 * - API: `/api/platform/observability/system-logs` (authenticate + requirePlatformAdmin)
 * - UI: `/platform/observability/system-logs` (VITE_SYSTEM_LOGS_UI_ENABLED, build-time)
 * - Retention: session `sp_getapplock` resource `dinamic:system-log-retention`
 * - Platform audit: `platform_audit_logs` when log has no companyId; else tenant `audit_logs`
 *
 * ## Feature flag matrix
 * | SYSTEM_LOGS_ENABLED | SYSTEM_LOGS_UI_ENABLED | VITE_SYSTEM_LOGS_UI_ENABLED | Effect |
 * |---|---|---|---|
 * | true | true | true | Persist + API + nav (if Platform Admin) |
 * | true | false | * | Persist only; API returns 404; hide nav via VITE |
 * | false | true | true | No SQL persist; API still readable for existing rows |
 * | * | * | false | Nav/page hidden in UI; backend auth still required |
 *
 * Backend authorization (`requirePlatformAdmin`) is the security barrier regardless of VITE_*.
 * `VITE_*` is resolved at image build time (see frontend/Dockerfile + compose build args).
 *
 * ## List vs detail
 * List/context return summary DTOs (no metadata/stack). Detail returns sanitized full row.
 * Free-text `q` matches message/event/module only inside the required time window.
 * Leading-wildcard LIKE does not use indexes; keep ranges tight.
 *
 * ## Process errors
 * - `uncaughtException` → fatal shutdown coordinator (log, drain sink, exit 1).
 * - `unhandledRejection` → structured error log; process stays alive to avoid dropping
 *   in-flight attendance/webhooks (documented acceptance).
 *
 * ## Configuration
 * See `.env.example` / Compose for SYSTEM_LOGS_* and VITE_SYSTEM_LOGS_UI_ENABLED.
 * Defaults for INFO allowlist are centralized in `constants/system-logs.ts`.
 *
 * ## Transition note
 * Morgan and some legacy `console.info` remain; stdout is mixed JSON + text during migration.
 */
