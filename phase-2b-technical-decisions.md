# DIN-406 Fase 2B — decisiones técnicas

## Reutilización (sin segundo motor)

- Contratos en `billing_subscriptions` + versiones inmutables en `billing_subscription_terms` (Fase 1B).
- Catálogo público en `billing_plans` / tiers / prices (Fases 1A–2A).
- Política comercial y exenciones estratégicas vía `billingPolicyService` (Fase 1C).
- Servicios existentes: `billingSubscriptionService.createAdminSubscription`, `registerContractualTerms`, `billingCommercialAdminService`.

## Modelo de acuerdos negociados

- Plan **CUSTOM** para importes/capacidades distintos del catálogo público (incluye <100 con precio excepcional).
- Plan **STANDARD** público solo cuando importe y capacidad coinciden con el catálogo vigente en la fecha contractual.
- Modificaciones manuales posteriores usan **nueva fila de término**; nunca se mutan importes históricos.

## Migración 165 (aditiva mínima)

Columnas en términos: `commercial_reference`, `created_by_user_id`, `admin_request_key`.  
En suscripciones: `admin_request_key` para idempotencia de alta.  
Índices únicos filtrados para reintentos administrativos sin duplicar acuerdos.

## Seguridad

- API bajo `/api/platform/billing/*` con `authenticate` + `requirePlatformAdmin` (superadmin de plataforma).
- Validación de pertenencia empresa ↔ suscripción en modificaciones (`BILLING_SUBSCRIPTION_COMPANY_MISMATCH`).

## Transacciones y concurrencia

- Reutiliza locks por empresa y versionado transaccional de 1B.
- Idempotencia: lectura previa por `admin_request_key` + manejo de unicidad SQL.

## Auditoría

- Evidencia contractual primaria en SQL (términos versionados + columnas de actor/referencia).
- `audit_logs` vía `logAuditSafe` cuando la tabla existe (entornos completos).

## Panel futuro

Endpoints documentados en rutas/schemas para listar contratos, crear acuerdo y registrar modificación.