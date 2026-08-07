# Database Integrity Phase 0A Corrections

## 1. Executive Summary

Estado:

```text
COMPLETE
```

Correcciones C1–C8 aplicadas sobre la implementación Phase 0A (H1–H4). Evidencia primaria de H1/H3/H4 ahora es SQL Server real (concurrencia + rollback). H2 (CAS + UNIQUE) se revalidó y permanece intacto.

## 2. Findings del review

| Finding | Problema | Corrección | Estado |
| ------- | -------- | ---------- | ------ |
| C1 | `resubmit` llamaba `assertNoOverlap` sin applock | Applock `absence:{company}:{employee}` antes del overlap check | fixed |
| C2 | Solo create×create concurrente | Integration: create vs resubmit (+ create vs updateNeedsInfo) | fixed |
| C3 | H3 sin race SQL approve vs delete | Integration + delete path con request/attachment locks | fixed |
| C4 | H4 solo smoke de source | Integration: success + before-commit failure + MessageSid retry | fixed |
| C5 | Todos los códigos negativos → timeout | Mapping explícito -1/-2/-3/other | fixed |
| C6 | ¿Eliminar `IX_attendance_reviews_attendance_id`? | Option A: queries usan `(company_id, attendance_id)`; IX ya dropped por 086 | documented |
| C7 | Tests thin de sql-app-lock | Unit tests de return codes + inputs Exclusive/Transaction | fixed |
| C8 | Evidencia Git / COMPLETE prematuro | Este reporte + artifacts `audit/*corrections*` | fixed |

## 3. H1 protocol audit

Callers de `assertNoOverlap` / `hasOverlappingRequest`:

| Caller | Transaction | AppLock | Overlap Check | Mutation |
| ------ | ----------- | ------- | ------------- | -------- |
| `createRequest` | yes | yes (before overlap) | yes | insert |
| `updateNeedsInfo` | yes | yes (after request UPDLOCK) | yes | update fields |
| `resubmit` | yes | yes (after request UPDLOCK) **fixed** | yes | status → PENDING |
| `hasOverlappingRequest` | N/A (repo) | N/A | read | none |

No otros callers de `assertNoOverlap` en el repo.

## 4. H1 resubmit correction

```text
resource: absence:{companyId}:{employeeId} (lowercase)
lock type: Exclusive
LockOwner: Transaction (auto-release on COMMIT/ROLLBACK)
timeout: 15000 ms default → ABSENCE_LOCK_TIMEOUT 409
order (existing-request mutations):
  1) findByIdForUpdate (request row)
  2) sp_getapplock employee
  3) attachment assert / overlap
  4) write
  5) commit
create path:
  1) sp_getapplock employee
  2) overlap
  3) insert
```

No unlock manual. Sin framework de retry de deadlock (no existía infraestructura 1205 reusable).

## 5. H1 concurrency results

| Scenario | Operation A | Operation B | Result |
| -------- | ----------- | ----------- | ------ |
| create vs create (same employee) | create | create | 1 success / 1 ABSENCE_OVERLAP; 1 active row |
| create vs create (different employees) | create A | create B | both success |
| create vs resubmit overlapping | create | resubmit | 1 success / 1 conflict; 1 active overlapping row |
| create vs updateNeedsInfo date expand | create | updateNeedsInfo | 1 success / 1 conflict; 1 active in target window |

## 6. H3 concurrency correction

```text
approve locking:
  request UPDLOCK → countAvailable AVAILABLE WITH (UPDLOCK, HOLDLOCK) → approve

attachment delete locking (softDelete SQL phase):
  request UPDLOCK → attachment UPDLOCK HOLDLOCK → PENDING_DELETE → commit
  then GCS (prod) / DELETED follow-up

lock order: request → attachment (compatible with approve)
final invariants:
  Case A: APPROVED + delete rejected (ABSENCE_ATTACHMENT_LOCKED / status conflict)
  Case B: not APPROVED + ABSENCE_ATTACHMENT_REQUIRED + attachment not AVAILABLE
  Never: APPROVED based on attachment that disappeared before commit
```

`softDeleteSqlOnlyForTests` reutiliza el mismo SQL phase para la race sin GCS.

## 7. H4 atomicity evidence

```text
successful transaction:
  checkout_at set + bot_session COMPLETED

forced failure (before-commit test hook):
  checkout_at IS NULL + session remains WAITING_CHECKOUT_LOCATION

retry / MessageSid:
  second processCheckoutWithoutLocation with same sid → no double checkout;
  session COMPLETED once
```

Hook: `checkout-transaction-hooks.ts` (solo tests; no-op en producción).

## 8. sp_getapplock semantics

| Return code | Meaning | App behavior |
| ----------- | ------- | ------------ |
| 0 / 1 | granted | success |
| -1 | timeout | `APP_LOCK_TIMEOUT` / `ABSENCE_LOCK_TIMEOUT` → 409 |
| -2 | cancelled | `APP_LOCK_CANCELLED` → 409 |
| -3 | deadlock victim | `APP_LOCK_DEADLOCK` → 409 (no se enmascara como timeout) |
| other negative | error | `APP_LOCK_ERROR` → 500 |

## 9. Attendance review indexes

Queries en `attendance-review.repository.ts` / cascade / H2 tests:

- todas filtran `company_id` **y** `attendance_id`
- no hay leading predicate solo `attendance_id` sin `company_id`

Decisión: **Option A — drop old IX es aceptable**.  
Estado DB local: solo `UQ_attendance_reviews_company_attendance` (+ PK).  
No se recreó `IX_attendance_reviews_attendance_id`.

## 10. Migration state

```text
086 not modified (ya aplicada en entorno local / historia compartida)
new migration: none (C6 Option A; no schema change required)
```

H2 UNIQUE + CAS se mantienen.

## 11. Tests

| Test | Type | Result |
| ---- | ---- | ------ |
| H1 create vs create same employee | integration | pass |
| H1 create vs create different employees | integration | pass |
| H1 create vs resubmit overlapping | integration | pass |
| H1 create vs updateNeedsInfo | integration | pass |
| H2 approve vs reject concurrent | integration | pass |
| H3 approve with attachment | integration | pass |
| H3 reject without attachment | integration | pass |
| H3 approve vs attachment delete | integration | pass |
| H4 success atomic | integration | pass |
| H4 injected failure rollback | integration | pass |
| H4 MessageSid idempotency | integration | pass |
| sql-app-lock return mapping | unit | pass |
| H3/H4 unit smoke | unit | pass |

## 12. Validation

```text
backend npm run build                         → pass
eslint (changed sources)                      → pass (after unused-var fix)
npx tsx --test sql-app-lock + h3.h4 unit      → pass (12)
RUN_DB_INTEGRATION_TESTS phase0a + corrections → pass (20 tests / 0 fail)
```

No se inventó retry framework. Deadlock se documenta/propaga como `APP_LOCK_DEADLOCK`.

## 13. Remaining issues

- Cleanup de fixtures de operaciones/workdays puede loguear FK warnings en `after` (no afecta aserciones).
- `softDeleteSqlOnlyForTests` es seam de test; producción usa `softDelete` (mismo locking SQL + GCS).
- No hay retry automático ante `APP_LOCK_DEADLOCK` / SQL 1205 (fuera de scope).
