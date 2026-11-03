# Final closure — attendance features (2026-11)

**Status:** `IMPLEMENTED_PENDING_INTEGRATION_VALIDATION`

**Production decision:** No desplegar basándose solo en unit tests. Ejecutar suites `describeDatabaseIntegration` contra SQL Server (mismas variables que CI/local `.env`) y confirmar verde antes de producción.

---

## Hallazgos vs estado

| Hallazgo | Estado |
|---|---|
| Edit post-commit alert loss | **FIXED** (reconciliation + heal); integración **NOT RUN** (DB skip) |
| Edit idempotency | **FIXED** (unit: heal sin re-update, sin bump duplicado) |
| Operational impact idempotency | **ACCEPTED** (invalidación de sync jobs; bump solo en primer commit, no en heal) |
| Export PDF mismatch | **FIXED** (UI HTML imprimible) |
| Export truncation | **FIXED** (hard cap + incomplete load + banner) |
| Export auth route | **VERIFIED** (unit middleware + HTTP test en suite integración **SKIP**) |
| Overlap edit UX | **FIXED** (código); tests FSM amplios **OPEN** |
| Balance override audit | **FIXED** (código); E2E **NOT RUN** (DB skip) |
| Negative balance persistence | **OPEN** hasta integración (test añadido, no ejecutado) |
| DAILY_EMAIL urgent WA | **VERIFIED** (policy unit PASS) |
| Reconciliation deterministic | **FIXED** (query updated edits + test backfill scoped); integración **NOT RUN** |

---

## Bloque 1–2 — Notificación durable de edición

**Fix:** `listMissingUpdatedAbsenceOperationalObligations` en `admin-alert-context.repository.ts` detecta eventos `UPDATED` con comentario `whatsapp-edit:{MessageSid}` sin outbox para dedup `absence-updated:operational:{requestId}:{sid}`. `reconcilePendingAbsenceRequests` materializa obligaciones faltantes.

**Heal inmediato:** `ensureOperationalForUpdatedRequest` sigue en retry; `includeOperationalBump: false` en rama `alreadyApplied`.

**Test obligatorio:** `admin-alert-absence-pending.integration.test.ts` → `reconciles updated operational alert after whatsapp edit emit failure without employee retry` (**SKIP** sin DB).

**Unit:** `admin-alert-reconciliation.service.test.ts` → materializes missing updated obligations (**PASS**).

---

## Bloque 3 — Operational impact version

**Semántica:** `operational_impact_version` incrementa en `absence_requests` y alimenta `expected_operational_impact_version` en jobs de sync operacional (Phase 5). Incrementos redundantes pueden disparar trabajo extra de reconciliación/sync.

**Fix:** No re-incrementar en heal idempotente (`includeOperationalBump: false`).

**Evidencia:** `absence-request-whatsapp-edit-side-effects.test.ts` (**PASS**).

---

## Bloque 4 — Saldo negativo E2E

**Fix:** Sin cambio de modelo; aprobación con override omite gate y persiste consumo vía flujo existente (no-ledger: `availableDays = assigned - approved - pending`).

**Test:** `absence-review-balance-override.integration.test.ts` (balance 0, request larga, override, audit `APPROVED` con before/after) — **SKIP** sin DB.

---

## Bloque 5 — Export incompleto

**Fix:** `expectedExportCount`, `truncatedByHardCap`, `incompleteLoad`, `truncated = cap ∨ load incompleto`. HTML distingue mensaje de carga parcial vs hard cap.

**Tests:** `whatsapp-conversation-export-messages.test.ts`, HTML test (**PASS**).

---

## Bloque 6 — HTTP export

**Fix:** Casos en `whatsapp-observability-conversations.integration.test.ts` (401, 404, HTML headers, JSON exportMeta) — suite **SKIP** sin DB.

---

## Bloque 7 — Observabilidad update

**Fix:** `emitAdminAlertSafely` source `absence-request-updated-operational` (antes `absence-request-created-operational`).

---

## Bloque 8–9 — Overlap / FSM

**Overlap:** Implementación previa mantenida; **no** se agregó matriz completa de tests de FSM/integración solicitada en el review.

---

## Bloque 10–11 — Regresión alerts / reconciliation

**DAILY_EMAIL + PENDING:** policy tests **PASS**.

**Reconciliation backfill test:** deja de assertar `recovery.recovered === 0` global (contaminación); asserta outbox local para dedups de la company.

---

## Tests ejecutados (esta corrida)

| Suite | Resultado |
|---|---|
| Unit closure bundle (22 tests) | **PASS** |
| Integration (4 suites) | **SKIP** (sin SQL Server en entorno) |

Ver `final-closure-tests.txt`.

---

## Archivos principales tocados

- `admin-alert-context.repository.ts` — obligaciones updated edit
- `admin-alert-reconciliation.service.ts` — wire reconcile
- `admin-alert-absence-updated.service.ts` — source label
- `admin-alert-emit.helpers.ts` — tipo source
- `absence-request-whatsapp-edit-side-effects.ts` — bump opcional
- `absence-request.service.ts` — heal sin bump
- `whatsapp-conversation-export-messages.ts` — incomplete load
- `whatsapp-conversation-export-html.ts` — meta + banners
- Tests: reconciliation, balance override, export HTTP, side-effects, idempotency

---

## Riesgos residuales

- Criterios de cierre con persistencia real no demostrados en este entorno (DB skip).
- Matriz FSM WhatsApp edit incompleta.
- Tipo de alerta sigue siendo `ABSENCE_REQUEST_PENDING` operacional (no existe `ABSENCE_REQUEST_UPDATED` en CK); dedup por edit distingue ediciones.

---

## No verificado aquí

- Ledger-enabled companies con override y saldo negativo en ledger SQL constraint.
- Entrega outbound WhatsApp real (Twilio).
- Suite backend completa / lint CI.

---

## Respuesta a “¿listo para producción?”

**Todavía no con evidencia completa.** La lógica de cierre está implementada y los unit tests críticos pasan; falta ejecutar integración DB (edit reconcile, balance −N, export HTTP, reconciliation backfill) en un entorno con SQL Server para responder sí con confianza.
