# Backend

Convención de `src/services/`. No duplica la auditoría de modularización.

Un servicio de un dominio que ya tiene carpeta nace en esa carpeta (`src/services/absence/`, `attendance/`, `bot/`, `companies/`, `employees/`, `identity/`, `locations/`, `operations/`, `payroll/`, `recommendation/`, `reports/`, `whatsapp/`, `work-teams/`, `workdays/`, `admin-alerts/`, `attachments/`). No se agrega un `index.ts` de dominio.

La raíz de `src/services/` solo admite servicios transversales:

- `audit.service.ts`
- `client.service.ts`
- `email.service.ts`
- `lookup.service.ts`
- `rate-limit-store.ts`
- `rate-limit-cleanup.service.ts`
- `replacement-request.service.ts`
- `server-status.service.ts`
- `statistics.service.ts`
- `system-logs.service.ts`

También pueden quedar ahí los tests de esos servicios y los tests de infraestructura ya listados en `src/services/services-root-allowlist.guard.test.ts`. Un archivo nuevo de dominio en la raíz hace fallar ese guard.

Los helpers de dominio van a `src/utils/<dominio>/`, no a `services/`.
