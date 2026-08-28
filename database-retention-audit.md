# Database Retention Audit

**Stage:** Crecimiento y retención de base de datos (read-only)  
**Database:** `dinamic_attendance` (SQL Server 2022)  
**Audit date:** 2026-08-28  
**Evidence tags used:** `EXECUTED_ON_DEV` | `DISCOVERED_FROM_SCHEMA` | `DISCOVERED_FROM_CODE` | `REQUIRES_PRODUCTION_EXECUTION`

> **Important:** Metrics marked `EXECUTED_ON_DEV` come from the local Docker SQL Server (`dinamic-attendance-sqlserver`, port 1435). That environment is dominated by integration-test fixtures and has **zero rows in `whatsapp_messages`**. Production sizing and growth rates **must** be obtained by running `database-retention-audit.sql` against staging/production before implementing purge jobs.

---

## Audit report (summary)

**Status:** `READY_WITH_CONDITIONS`

**Stage audited:** Database growth and retention policy design (pre-implementation)

**Summary:**

- Dev DB is small (~255 MB used / 656 MB allocated); **`audit_logs` is the largest table** (~11 MB, 3,780 rows, ~44% of table data pages) — driven by `previous_data` / `new_data` NVARCHAR(MAX). `DISCOVERED_FROM_SCHEMA` + `EXECUTED_ON_DEV`
- **No time-based row deletion** exists for `whatsapp_messages`, `whatsapp_conversations`, `whatsapp_webhook_events`, `bot_sessions`, or terminal notification outboxes. Only partial observability cleanup (90-day default) deletes flow traces/provider events and nulls `template_variables_json` on old messages. `DISCOVERED_FROM_CODE`
- **Highest production growth risk** (by write path + payload size): `whatsapp_messages` (`body`, `raw_payload`), `whatsapp_webhook_events` (`response_body`), `whatsapp_provider_events`, observability flow tables, expired `bot_sessions`. `DISCOVERED_FROM_CODE`
- **Core business tables must not be purged:** `attendance_records`, `absence_requests`, `scheduled_operations`, `employees`, `payroll_receipts`, etc. `DISCOVERED_FROM_CODE`
- **Existing retention:** observability cleanup job (6h), absence attachment cleanup (120s), bot session lazy expiry (TTL 15 min, rows kept), company deletion purge (tenant-scoped). `DISCOVERED_FROM_CODE`
- **Condition before implementation:** Run section 2–10 of `database-retention-audit.sql` on production/staging; validate FK `NO ACTION` chains; legal/ops sign-off on `audit_logs` retention.

**Suggested next command:** `/implement-dinamic-stage` — only after production metrics review and explicit approval of per-table retention policies.

---

## 1. Executive summary

| Question | Answer (dev) | Confidence |
|----------|--------------|------------|
| Current DB size | **255 MB used**, 656 MB allocated (MDF 136 MB / LDF 520 MB files) | `EXECUTED_ON_DEV` EXACT |
| Heaviest tables | `audit_logs` (11.2 MB), `employee_workdays`, `operation_workdays`, `attendance_records` | `EXECUTED_ON_DEV` EXACT |
| Fastest historical accumulators (prod expectation) | `whatsapp_messages`, `whatsapp_webhook_events`, `whatsapp_provider_events`, `bot_sessions`, observability flow tables | `DISCOVERED_FROM_CODE` — **REQUIRES_PRODUCTION_EXECUTION** |
| Top purge candidates | Expired `bot_sessions`, old `whatsapp_webhook_events`, observability orphans, terminal notification outbox + send_attempt rows, optional truncation of message `raw_payload` | `DISCOVERED_FROM_SCHEMA` |
| Main risks | FK `NO ACTION` chains, partial conversation deletion, pending webhooks/outbox rows, audit/compliance loss on `audit_logs` | `DISCOVERED_FROM_CODE` |

---

## 2. Database overview

**Global size** (`EXECUTED_ON_DEV`):

| Metric | Value |
|--------|-------|
| Used space | 254.8 MB |
| Allocated space | 656.0 MB |
| MDF data file | 136 MB allocated, 76 MB used, 60 MB free in file |
| LDF log file | 520 MB allocated, 178.8 MB used, 341.2 MB free in file |
| Growth setting | 8192 (8 MB steps), max_size = unlimited (-1) |

| Tabla | Filas | Data MB | Index MB | Total MB | % DB |
|-------|------:|--------:|---------:|---------:|-----:|
| audit_logs | 3,780 | 11.01 | 0.21 | 11.22 | 44.0% |
| employee_workdays | 452 | 0.56 | 1.13 | 1.70 | 6.7% |
| operation_workdays | 366 | 0.40 | 0.52 | 0.92 | 3.6% |
| attendance_records | 72 | 0.24 | 0.45 | 0.70 | 2.7% |
| operational_locations | 542 | 0.18 | 0.48 | 0.66 | 2.6% |
| operation_assignments | 91 | 0.15 | 0.50 | 0.65 | 2.5% |
| users | 570 | 0.34 | 0.13 | 0.47 | 1.8% |
| employees | 36 | 0.09 | 0.38 | 0.47 | 1.8% |
| user_two_factor_recovery_codes | 880 | 0.16 | 0.20 | 0.37 | 1.4% |
| bot_simulation_sessions | 34 | 0.32 | 0.02 | 0.34 | 1.3% |
| *(remaining 63 tables)* | … | … | … | < 0.3 MB each | … |

**Note:** Row counts use `sys.dm_db_partition_stats` (index_id 0/1). Summing `sys.partitions.rows` across all indexes **over-counts** (~4× for `audit_logs`).

---

## 3. Top storage consumers

Top 10 by used MB (`EXECUTED_ON_DEV`):

1. **audit_logs** — 11.22 MB — audit JSON snapshots (`previous_data`, `new_data`)
2. **employee_workdays** — 1.70 MB — derived workday materialization
3. **operation_workdays** — 0.92 MB — derived workday materialization
4. **attendance_records** — 0.70 MB — core business
5. **operational_locations** — 0.66 MB — core config
6. **operation_assignments** — 0.65 MB — core business
7. **users** — 0.47 MB — identity
8. **employees** — 0.47 MB — core business
9. **user_two_factor_recovery_codes** — 0.37 MB — security artifacts
10. **bot_simulation_sessions** — 0.34 MB — dev simulator (`messages_json` MAX)

WhatsApp tables are **negligible in dev** (`whatsapp_messages` = 0 rows). In production they are expected to rank in the top tier due to per-message `NVARCHAR(MAX)` payloads.

---

## 4. Historical accumulation

| Tabla | >30d | >60d | >90d | >180d | Retention column | Source |
|-------|-----:|-----:|-----:|------:|------------------|--------|
| audit_logs | 665 | 23 | 0 | 0 | `created_at` | `EXECUTED_ON_DEV` |
| bot_sessions | 15 | 0 | 0 | — | `expires_at` | `EXECUTED_ON_DEV` |
| whatsapp_webhook_events | 0 | 0 | 0 | — | `created_at` | `EXECUTED_ON_DEV` |
| whatsapp_messages | 0 | 0 | 0 | — | `created_at` | `EXECUTED_ON_DEV` |
| whatsapp_conversations | 0 | — | — | — | `last_activity_at` | `EXECUTED_ON_DEV` |
| whatsapp_flow_executions | 0 | 0 | 0 | — | `started_at` | `EXECUTED_ON_DEV` |
| whatsapp_attendance_notifications | 1 | — | — | — | `created_at` | `EXECUTED_ON_DEV` |

**Timezone:** All audited datetime columns default to `SYSUTCDATETIME()` in migrations. Application uses UTC for session expiry (`README.md`). Use **UTC cutoffs** (`SYSUTCDATETIME()`) for retention jobs — do not mix with `GETDATE()` or `America/Argentina/Buenos_Aires` without explicit conversion.

---

## 5. Growth by month

| Tabla | 2026-06 | 2026-07 | 2026-08 | Trend |
|-------|--------:|--------:|--------:|-------|
| audit_logs | 97 | 2,017 | 1,666 | High (test activity) |
| bot_sessions | 3 | 12 | 4 | Low |
| whatsapp_webhook_events | — | — | 29 | All in Aug (dev) |

**Projection:** Insufficient production history in dev to project 6/12-month growth. `REQUIRES_PRODUCTION_EXECUTION`.

Rough dev estimate for `audit_logs`: ~1,800 rows/month × ~585 bytes avg payload ≈ **1 MB/month** (EXACT avg from dev: 585 bytes/row, 2.1 MB total payload). Production audit volume depends on operator activity.

---

## 6. Large payload columns

| Tabla | Columna | Tipo | Uso | Riesgo |
|-------|---------|------|-----|--------|
| whatsapp_messages | body, raw_payload | NVARCHAR(MAX) | Inbound/outbound message text + sanitized Twilio payload | **HIGH** — unbounded per message |
| whatsapp_webhook_events | response_body | NVARCHAR(MAX) | TwiML replay for idempotent webhook responses | **HIGH** |
| whatsapp_provider_events | payload_json_sanitized | NVARCHAR(MAX) | Delivery/status callbacks | **HIGH** (90d cleanup exists) |
| whatsapp_flow_steps | input_summary_json, output_summary_json | NVARCHAR(MAX) | Observability trace | **MEDIUM** (90d cleanup) |
| whatsapp_flow_candidates | candidate_snapshot_json | NVARCHAR(MAX) | Observability | **MEDIUM** |
| whatsapp_flow_executions | metadata_json | NVARCHAR(MAX) | Observability | **MEDIUM** |
| bot_sessions | context_json | NVARCHAR(MAX) | Session state (location, inventory selection) | **MEDIUM** — rows never deleted |
| audit_logs | previous_data, new_data | NVARCHAR(MAX) | Entity change snapshots | **MEDIUM/HIGH** — audit value |
| bot_simulation_sessions | messages_json, technical_details_json | NVARCHAR(MAX) | Dev simulator only | **LOW** (non-prod) |
| import_jobs | prepared_plan_json, result_json | NVARCHAR(MAX) | Import artifacts | **LOW/MEDIUM** |
| absence_operational_effects | applied_state_json, previous_state_json | NVARCHAR(MAX) | Absence side-effects | **LOW** (core domain) |
| whatsapp_admin_alert_notifications | content_variables_json | NVARCHAR(MAX) | Template variables | **MEDIUM** |

**Dev payload measurements (`EXECUTED_ON_DEV`):**

| Table | Avg payload | Max payload | Total payload MB |
|-------|------------:|------------:|-----------------:|
| audit_logs | 585 B | 8.5 KB | 2.1 |
| bot_sessions | 67 B | 404 B | negligible |

---

## 7. Referential dependencies

WhatsApp / observability chain (`DISCOVERED_FROM_SCHEMA`, all FKs `ON DELETE NO ACTION`):

```
companies
  ├── whatsapp_conversations
  │     ├── whatsapp_messages (conversation_id, company_id)
  │     ├── whatsapp_flow_executions (conversation_id)
  │     └── whatsapp_attendance_notifications (conversation_id)
  ├── whatsapp_webhook_events
  ├── whatsapp_flow_executions (company_id)
  │     ├── whatsapp_flow_steps
  │     └── whatsapp_flow_candidates
  └── bot_sessions (company_id)

whatsapp_messages
  └── whatsapp_provider_events (message_id)

whatsapp_attendance_notifications
  └── whatsapp_flow_executions (notification_id)

Notification outboxes (parallel pattern):
  whatsapp_*_notifications → whatsapp_*_notification_send_attempts
```

**Purge order implication:** Children before parents — e.g. `whatsapp_provider_events` → `whatsapp_flow_steps/candidates` → `whatsapp_flow_executions` → `whatsapp_messages` → `whatsapp_conversations`. Company purge already implements this in `company-purge.repository.ts`.

**Orphan risk:** Deleting `whatsapp_messages` without provider events / flow executions leaves FK violations. Deleting conversations while messages remain — same.

---

## 8. Existing retention mechanisms

| Mechanism | Location | What it does | What it does NOT do |
|-----------|----------|--------------|---------------------|
| WhatsApp observability cleanup | `backend/src/jobs/whatsapp-observability-cleanup.job.ts` + `whatsapp-observability.repository.ts` | Every 6h; DELETE flow candidates/steps/provider events/executions older than retention days (default **90**); UPDATE `whatsapp_messages.template_variables_json = NULL` | Does not DELETE messages, conversations, webhooks, bot_sessions |
| Env knobs | `WHATSAPP_OBSERVABILITY_*_RETENTION_DAYS` (default 90) | Per-artifact retention | — |
| Bot session TTL | `bot-session.service` / `expires_at` | Lazy expiry on read; states → EXPIRED | Rows **persist indefinitely** |
| Absence attachment cleanup | `absence-attachment-cleanup.job.ts` (120s) | GCS + DB cleanup for pending/failed attachments (`ABSENCE_ATTACHMENT_PENDING_TTL_MINUTES=60`) | Not SQL row purge for requests |
| Company deletion purge | `company-deletion.job.ts` + `company-purge.repository.ts` | Full tenant DELETE including WhatsApp tables | Only on company lifecycle DELETING |
| Auth token expiry | invitations, password reset, 2FA challenges | Application-level ignore | Rows may accumulate |

**Grep finding:** No `purge`/`retention` job for `whatsapp_messages`, `whatsapp_webhook_events`, or `bot_sessions` beyond observability subset.

---

## 9. Data classification

| Tabla | Clasificación | Retención sugerida |
|-------|---------------|-------------------|
| companies, employees, users, company_settings | CORE_BUSINESS | Permanente |
| scheduled_operations, operation_assignments, attendance_records | CORE_BUSINESS | Permanente |
| absence_requests, absence_request_events, employee_absence_balances | CORE_BUSINESS | Permanente |
| payroll_receipts, payroll_receipt_batches | CORE_BUSINESS | Permanente (legal) |
| employee_workdays, operation_workdays | DERIVED | Permanente* (rebuildable but costly) |
| audit_logs | AUDIT | 1–3 años o permanente (decisión legal/ops) |
| company_lifecycle_events | AUDIT | ≥ 1 año |
| whatsapp_messages | TECHNICAL + partial AUDIT | 90–180 días (payload trim earlier) |
| whatsapp_webhook_events | TECHNICAL | 30–60 días post-PROCESSED |
| whatsapp_provider_events | TECHNICAL | 90 días (ya implementado) |
| whatsapp_flow_* | TECHNICAL | 90 días (ya implementado) |
| whatsapp_conversations | DERIVED/TECHNICAL | 90 días post-COMPLETED/ERROR |
| bot_sessions | EPHEMERAL | 30 días post-`expires_at` + terminal state |
| bot_simulation_sessions | EPHEMERAL | 30 días (non-prod) |
| whatsapp_*_notifications + send_attempts | TECHNICAL | 90–180 días terminal rows |
| import_jobs | DERIVED | 90 días post-completed |
| user_password_reset_tokens, user_two_factor_login_challenges | EPHEMERAL | 30–90 días |
| user_two_factor_recovery_codes | CORE_BUSINESS | Hasta rotación/consumo |
| system_migrations | TECHNICAL | Permanente |

\*Workdays tie to payroll/attendance history — treat as long-retention unless rebuild pipeline is proven.

---

## 10. Purge candidates

### whatsapp_webhook_events

- **Función:** Durable webhook idempotency + TwiML replay (`whatsapp-webhook-event.repository.ts`)
- **Peso actual (dev):** 0.08 MB, 29 rows — `EXECUTED_ON_DEV`
- **Antigüedad (dev):** 0 rows >30d (all Aug 2026)
- **Criterio temporal:** `created_at` / `processed_at` when `processing_status IN ('PROCESSED','FAILED','ANOMALY')` AND no active lease
- **Retención propuesta:** **60 días** (30 días if volume critical)
- **Dependencias:** None outbound; company FK
- **Riesgos:** Deleting `PROCESSING` or retryable `FAILED` breaks replay
- **Espacio recuperable:** `REQUIRES_PRODUCTION_EXECUTION`
- **Confianza:** Policy = `DISCOVERED_FROM_CODE`; Weight = `REQUIRES_PRODUCTION_EXECUTION`

### bot_sessions

- **Función:** WhatsApp bot state machine (attendance, absence, payroll flows)
- **Peso actual (dev):** 0.17 MB, 19 rows; 15 expired >30d by `expires_at`
- **Criterio temporal:** `expires_at < cutoff` AND `state IN ('COMPLETED','CANCELLED','EXPIRED')` AND NOT referenced by `whatsapp_payroll_receipt_query_deliveries.bot_session_id`
- **Retención propuesta:** **30 días** after expiry
- **Riesgos:** Active session deletion mid-flow; payroll delivery FK
- **Espacio recuperable (dev est.):** ~0.13 MB at 30d — `ESTIMATED`
- **Confianza:** `DISCOVERED_FROM_CODE` + dev counts

### whatsapp_messages

- **Función:** Durable message log (inbound/outbound); observability correlation
- **Peso actual (dev):** 0 rows
- **Criterio temporal:** Two-phase: (1) null `raw_payload` >30d; (2) DELETE row >90–180d if no FK refs (`provider_events`, `flow_executions.source_message_id`)
- **Retención propuesta:** **180 días** row retention; **30 días** payload trim
- **Riesgos:** Observability UI gaps; FK to provider_events
- **Confianza:** `DISCOVERED_FROM_CODE` — **HIGH production impact**

### whatsapp_conversations

- **Función:** Observability grouping + message_count aggregates
- **Criterio temporal:** `last_activity_at < cutoff` AND `status <> 'ACTIVE'` AND no child messages
- **Retención propuesta:** **90 días**
- **Riesgos:** Must delete messages first (FK NO ACTION)

### whatsapp_*_notifications + send_attempts

- **Función:** Outbound notification outbox pattern
- **Criterio temporal:** Terminal status (`SENT`, `FAILED`, `SUPERSEDED`, etc.) AND `created_at < cutoff` AND no active lease
- **Retención propuesta:** **180 días** (attempts with parent)
- **Riesgos:** `flow_executions.notification_id` FK

### audit_logs

- **Función:** Entity change audit trail
- **Peso actual (dev):** 11.22 MB; 665 rows >30d (~2.0 MB estimated proportional)
- **Criterio temporal:** `created_at` with legal hold exceptions
- **Retención propuesta:** **≥ 1 year** or permanent — **not 30 days by default**
- **Riesgos:** Compliance, support investigations
- **Confianza:** Dev weight `EXACT`; policy needs stakeholder decision

### import_jobs

- **Función:** CSV/generic import runs
- **Retención propuesta:** **90 días** after terminal status
- **Riesgos:** Low

---

## 11. Tables that MUST NOT be purged

- `attendance_records` — legal/operational proof of check-in/out
- `absence_requests`, `absence_request_events`, `absence_request_attachments` (metadata; GCS separate)
- `scheduled_operations`, `operation_assignments`, `operation_workdays`
- `employees`, `companies` (except orchestrated company deletion)
- `payroll_receipts`, `payroll_receipt_batches`
- `employee_absence_balances`, `employee_absence_balance_movements`
- `users`, `user_company_memberships` (identity)
- `operational_locations`, `location_zones`, `company_*` configuration
- `system_migrations`
- Any row with `companies.lifecycle_status = 'DELETING'` or active notification/webhook leases

---

## 12. Recommended retention policy

| Tabla | Política | Motivo |
|-------|----------|--------|
| whatsapp_messages.raw_payload | Null after **30d** | Large Twilio payload; low replay value |
| whatsapp_messages (row) | **180d** | Balance observability vs size |
| whatsapp_webhook_events | **60d** post-terminal | Idempotency window + incident debug |
| whatsapp_provider_events | **90d** (existing) | Already implemented |
| whatsapp_flow_steps/candidates/executions | **90d** (existing) | Already implemented |
| whatsapp_conversations | **90d** post-closed | Derived grouping |
| bot_sessions | **30d** post-expired terminal | Ephemeral session state |
| whatsapp_*_notifications (+ attempts) | **180d** terminal | Outbox audit trail |
| audit_logs | **365d–permanent** | Compliance — not default 30d |
| import_jobs | **90d** | Reconstructable artifacts |
| bot_simulation_sessions | **30d** | Dev-only |
| user_password_reset_tokens | **90d** | Ephemeral auth |
| user_two_factor_login_challenges | **30d** | Ephemeral auth |
| attendance_records | **Permanente** | Core business |
| employee_workdays / operation_workdays | **Permanente** | Historical operations |

---

## 13. Proposed future cleanup architecture

Conceptual design only — **not implemented**.

```
┌─────────────────────────────────────────────────────────┐
│  retention-orchestrator.job (daily, off-peak)           │
│  - distributed lease (single runner)                    │
│  - configurable per-table policies from env             │
└────────────┬────────────────────────────────────────────┘
             │
   ┌─────────┴──────────┬─────────────────┬──────────────┐
   ▼                    ▼                 ▼              ▼
webhook-purge      session-purge    message-payload   outbox-purge
(batches TOP 200)  (expires_at)     trim (UPDATE)     (terminal FK-safe)
             │
             ▼
   extend existing whatsapp-observability-cleanup.job
   (already batch DELETE TOP 200)
```

**Batch pattern:** `DELETE TOP (@batchSize) ... ORDER BY <retention_column>` in loops with short transactions; cap batches per tick; monitor log growth.

**Index recommendations (future, not now):**

- `bot_sessions (expires_at, state)` filtered WHERE terminal states — if not already sufficient via `IX_bot_sessions_expires_at`
- `whatsapp_webhook_events (processing_status, created_at)` — complement existing indexes for purge scans

---

## 14. Risks and open questions

| Severity | Finding |
|----------|---------|
| **CRITICAL** | No production metrics in this report — sizing/purge ROI unknown for `whatsapp_messages` |
| **HIGH** | `whatsapp_messages` unbounded growth with full `raw_payload` per inbound webhook |
| **HIGH** | All WhatsApp FKs are `NO ACTION` — naive DELETE causes constraint failures |
| **HIGH** | Partial purge of conversations while `status='ACTIVE'` would break UX/observability |
| **MEDIUM** | `audit_logs` grows with every entity mutation — 30d universal rule would violate audit needs |
| **MEDIUM** | LDF 520 MB allocated vs 255 MB used — cleanup won't shrink files without separate maintenance |
| **MEDIUM** | `bot_sessions` accumulate despite 15-min TTL |
| **LOW** | `bot_simulation_sessions` stored in same DB as production schema |
| **INFO** | Observability cleanup already aligned to 90d — extending to 30d would need env change + impact review |

**Open questions:**

1. Legal/compliance minimum retention for `audit_logs` and `attendance_records` in Argentina operations?
2. Does observability UI require `whatsapp_messages` older than 90 days?
3. Is staging DB representative enough to run purge dry-runs?
4. Should `raw_payload` be truncated at ingest instead of deferred cleanup?

---

## 15. Final verdict

**`READY_WITH_CONDITIONS`**

Ready to **design** retention jobs and env configuration, conditioned on:

1. Executing `database-retention-audit.sql` on **staging/production**
2. Stakeholder decision on `audit_logs` and message row retention
3. FK-safe purge ordering documented per table
4. Dry-run mode (`SELECT` counts only) in first deployment

---

# Appendix A — Requirements matrix (audit-dinamic-stage)

| Requirement | Status | Evidence / gap |
|-------------|--------|----------------|
| Map all tables + purpose | OK | 73 tables in dev; migrations `001`–`104` |
| Per-table size query (correct joins) | OK | `database-retention-audit.sql` §2 uses `dm_db_partition_stats` |
| Global DB size MDF/LDF vs used | OK | §1; dev: 255 MB used / 656 MB allocated |
| MAX/BLOB column inventory | OK | §3; 21 columns identified |
| Date column semantics | OK | §4 + per-table notes in §10 |
| Age distribution queries | OK | §7; dev metrics in §4 |
| Monthly growth | PARTIAL | Dev only; production `REQUIRES_DB_EXECUTION` |
| Conversational/technical deep dive | OK | §6–§8, Appendix B |
| FK dependency analysis | OK | §7 |
| Index review (read-only) | OK | §6 in SQL; dev index sizes negligible |
| Existing retention search | OK | §8 |
| Active/pending guards | OK | SQL §11 |
| Purge candidate quantification | PARTIAL | Dev estimates; production unknown |
| Per-table retention policy | OK | §12 |
| Future cleanup performance notes | OK | §13 |
| Read-only SQL artifact | OK | `database-retention-audit.sql` |
| No destructive operations | OK | Audit was read-only |

---

# Appendix B — WhatsApp / technical tables (writers & readers)

| Tabla | Writer(s) | Reader(s) | Write frequency | Cleanup | TTL |
|-------|-----------|-----------|-----------------|---------|-----|
| whatsapp_messages | `whatsapp-message.repository` (webhook) | Observability API, message repo | Per inbound/outbound message | None (template_vars null only) | No |
| whatsapp_webhook_events | `whatsapp-webhook-event.repository` | Webhook claim/replay | Per webhook POST | None | Lease on PROCESSING |
| whatsapp_provider_events | Observability service | Observability API | Status callbacks | **90d DELETE** | No |
| whatsapp_flow_executions/steps/candidates | Observability service | Observability API | Per flow | **90d DELETE** | No |
| whatsapp_conversations | Observability service | Observability API | Per conversation touch | None | No |
| bot_sessions | `bot-session.repository` | Bot services | Per user flow | Lazy expire only | 15 min active |
| whatsapp_attendance_notifications | `attendance-notification.repository` | Reminder job, observability | Scheduled + retries | None | Lease |
| whatsapp_admin_alert_notifications | Admin alert repo | Admin alert job | Alert events | None | Lease |
| whatsapp_operation_assignment_notifications | Assignment notification repo | Job | Assignment events | None | Lease |
| whatsapp_payroll_receipt_notifications | Payroll notification repo | Job | Payroll sends | None | Lease |

---

# Appendix C — Schema consistency findings

| Severity | Finding |
|----------|---------|
| INFO | `inventories` replaced by `scheduled_operations`; legacy view dropped (`037_domain_rename_completion.sql`) |
| INFO | `whatsapp_messages` has both `company_id` and `conversation_id` — company purge handles both paths |
| MEDIUM | Duplicate storage: message body + `raw_payload` + webhook `response_body` for same interaction |
| LOW | `bot_simulation_sessions` coexists with production schema — consider separate DB in dev |
| LOW | `system_settings` empty — unused or legacy |
| INFO | Observability cleanup deletes executions only when no steps/candidates remain — orphan executions possible briefly |

---

**Artifacts:**

- Read-only SQL: [`database-retention-audit.sql`](./database-retention-audit.sql)
- Execute on production: `sqlcmd -S <host> -d dinamic_attendance -i database-retention-audit.sql -C`

**Suggested next command:** `/implement-dinamic-stage` — after production metrics review and signed retention policy.
