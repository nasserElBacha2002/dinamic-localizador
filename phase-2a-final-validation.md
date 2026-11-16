# DIN-406 Fase 2A — validación final

**Estado:** `PHASE_2A_IMPLEMENTED_VALIDATED_READY_FOR_REVIEW`

**Rama:** `DIN-406`

## Resumen de correcciones (review bloqueante)

| ID | Hallazgo | Acción | Verificación |
|----|----------|--------|--------------|
| P1.1 | Seed republicaba planes despublicados | Eliminado republish en plan existente; solo `isPublicForNewSubscription: true` en alta nueva | Ephemeral: `does not republish LANZAMIENTO after an administrator unpublishes it` |
| P1.2 | Bypass por `billingPlanPriceId` | Validación completa del precio referenciado + comparación de importe acordado | Ephemeral: reject con precio válido e importe USD 180 |
| P1.3 | `return` sin precio en contratación pública | Rechazo explícito `BILLING_SUBSCRIPTION_CATALOG_PRICE_UNAVAILABLE`; legacy `!isPublicForNewSubscription` sin enforcement | Ephemeral + subscription integration |
| P2.1 | ensure migración 164 incompleto | Registro 164 + columna/tipo/null/default/índice; fallo explícito si inconsistente | `migration-164-billing-plan-public-offering.integration.test.ts` |
| P2.2 | `findNegotiatedCapacitySubscriptions` histórico incierto | Deprecación/documentación; `findCustomPlanSubscriptions` para CUSTOM | Comentarios en `billing-commercial-admin.service.ts`; tests CUSTOM |
| P2.3 | Clasificación precios no determinista | `referenceAt` en `classifyLaunchTierPriceCatalogState` | `launch-catalog-price-state.test.ts` (5 casos) |

## Gates ejecutados

| Gate | Comando | Exit | Notas |
|------|---------|------|-------|
| Build | `cd backend && npm run build` | 0 | `tsc -p tsconfig.json` |
| Lint | `cd backend && npm run lint` | 1 | Solo `employee.service.ts` (pre-existente en `origin/main`) |
| Unit billing | 3 archivos `*.test.ts` bajo `billing/` + utils | 0 | 13/13 |
| SQL billing 1A–2A | 12 suites integración (ver `phase-2a-final-tests.txt`) | 0 | 79/79; bases efímeras create/destroy |

## Lint pre-existente (`employee.service.ts`)

Mensajes exactos:

```
232:9  error  The value assigned to 'updated' is not used in subsequent statements               no-useless-assignment
233:9  error  The value assigned to 'revokedAssignmentIds' is not used in subsequent statements  no-useless-assignment
```

Misma salida al lintear copia de `origin/main:backend/src/services/employees/employee.service.ts` (no modificado en DIN-406).

## Ajustes menores en esta pasada final

- `billing-plan-public-offering-schema.ts`: verificación de columna vía `INFORMATION_SCHEMA.COLUMNS`.
- Tests ephemeral: fechas alineadas con vigencia de catálogo (política contractual P1.3).
- Lint billing: imports/variables no usadas en archivos tocados.

## Artefactos

- `phase-2a-final-status.txt`
- `phase-2a-final-diffstat.txt`
- `phase-2a-final-diff.txt` (diff completo ~6500 líneas)
- `phase-2a-final-tests.txt`
- `phase-2a-final-tests-integration.log` (TAP completo integración)
- Copias en `review/latest-*` y `review/phase-2a-final-*`

## Riesgos / seguimiento

- Lint global del backend sigue en rojo por `employee.service.ts` (fuera de alcance DIN-406).
- `findNegotiatedCapacitySubscriptions` no debe usarse como clasificación histórica definitiva hasta marca contractual explícita (Fase posterior).

## Para el revisor

Revisar de nuevo:

1. Seed LANZAMIENTO tras despublicar admin (P1.1).
2. Alta suscripción pública con `billingPlanPriceId` + importe distinto (P1.2).
3. Alta pública sin tarifa vigente en fecha contractual (P1.3).
4. Integridad 164 en DB descartable (P2.1).