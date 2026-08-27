# Auditoría — Geolocalización para Recomendaciones IA

> **PRE-IMPLEMENTATION AUDIT** (2026-08-25).  
> Este documento captura el estado **antes** de Location Proximity Phase A.  
> Los GAP aquí descritos (centroides null, sin geocoding de zonas, UI sin lat/lng)  
> fueron abordados en la implementación posterior; no interpretar este archivo como  
> estado post-implementación.

**Modo:** read-only (sin cambios de código de aplicación)  
**Fecha:** 2026-08-25  
**Repo:** `dinamic-localizador`  
**Estado (al momento de la auditoría):** `IMPLEMENTED_WITH_ISSUES` — el scoring geográfico **ya existía** en el motor; el gap crítico era que los **centroides de zonas estaban vacíos** y no había geocoding de zonas.

---

## 1. Resumen ejecutivo

- La entidad geográfica de empleados/servicios es `dbo.location_zones` (migración `094` / `095`): catálogo **por empresa**, no GPS de domicilio.
- Convención documentada en SQL: **`name` = barrio/zona**, **`locality` = localidad/agrupador** (ej. CABA, GBA, Córdoba).
- `centroid_latitude` / `centroid_longitude` existen (DECIMAL nullable, CHECK de par), se exponen por API y se aceptan en create/update, pero **la UI y el `findOrCreate` los dejan en `null`**.
- El motor `workforce-recommendation-v1` **ya calcula** proximidad con Haversine (zona → coordenadas del **servicio**) y peso `locationProximity = 0.25`; sin centroide → bucket `UNKNOWN` → se omite el feature y se renormalizan pesos.
- Hay geocoding **Google Maps** solo en herramientas de **reconciliación de servicios** (`service-reconciliation/geocoding.ts`), **no** aplicado a `location_zones`.
- MVP viable: backfill + create-path async de centroides + edición manual en UI; **no** hace falta reinventar el scorer ni PostGIS.

---

## 2. Arquitectura actual encontrada

```text
Configuración → Zonas geográficas (LocationZonesDialog)
       ↓ CRUD name/locality (sin centroides en UI)
location_zones (company_id, name, locality, centroid_*)
       ↓ FK
employees.location_zone_id
operational_locations.location_zone_id  (+ lat/lng exactos del servicio)

Operación → serviceId → operational_locations (latitude, longitude, locationZoneId)
       ↓
individual-recommendation / team-recommendation
       ↓
distanceMetersBetween(zone.centroid, service.lat/lng)
  OR sameZone (mismo location_zone_id)
       ↓
resolveLocationProximityBucket → LOCATION_PROXIMITY_BUCKET_SCORES
       ↓
combineRecommendationScore (pesos V1)
```

Capas relevantes:

| Capa | Piezas |
|------|--------|
| DB | `094_employee_location_zones.sql`, `095_shared_geographic_zones_services.sql` |
| Backend | `location-zone.*`, `recommendation-feature.repository`, `recommendation-scorer`, `individual-recommendation.service`, `team-recommendation.service` |
| Geocoding servicios | `utils/service-reconciliation/geocoding.ts` (Google) |
| Distancia | `utils/haversine.ts`, `geolocation.service.ts` |
| Frontend | `LocationZonesDialog*`, `EmployeeLocationZoneSelect`, paneles AI recommendations |

---

## 3. Modelo de datos geográfico actual

### Entidad principal: `location_zones`

Definida en `database/migrations/094_employee_location_zones.sql`:

- `id`, `company_id`
- `name` NVARCHAR(120), `normalized_name`
- `locality` NVARCHAR(120) NULL, `normalized_locality` NOT NULL DEFAULT `''`
- `centroid_latitude` / `centroid_longitude` DECIMAL(10,7) NULL
- `is_active`, timestamps
- Unique: `(company_id, normalized_name, normalized_locality)`
- CHECK: centroides ambos null o ambos set; rangos lat/lng

Comentario de migración 094:

> Phase 0 AI foundation: company-scoped **approximate residence zones** for employees. Does NOT store exact home addresses.

Migración 095:

> `location_zones` remains the company-scoped catalog (**barrio = name, localidad = locality**).  
> **Centroids are NOT backfilled from service coordinates.**

### Otras entidades geográficas (distinto propósito)

| Entidad | Uso |
|---------|-----|
| `operational_locations` | Sucursales/servicios con **lat/lng exactos** + `neighborhood`/`locality` denormalizados + `location_zone_id` |
| Attendance / bot | GPS en tiempo real del colaborador (Haversine vs servicio) — no es zona de residencia |
| Company location types | Tipología de formato de sucursal — no catálogo barrio |

---

## 4. Uso actual de centroidLatitude / centroidLongitude

| Pregunta | Evidencia |
|----------|-----------|
| ¿Dónde se definen? | SQL `094`; tipos `backend/src/types/location-zone.ts`; FE `frontend/src/types/location-zone.ts` |
| ¿Quién escribe? | `locationZoneRepository.create/update` si el input trae valores; schema Zod permite par nullable |
| ¿Quién lee? | List API; `recommendationFeatureRepository` JOIN `lz.centroid_*` para candidatos |
| ¿UI escribe? | **No** — `LocationZonesDialogContent` solo name/locality/isActive |
| ¿findOrCreate escribe? | **Siempre null** — `locationZoneService.findOrCreateByNameLocality` |
| ¿Backfill 095? | **Explícitamente no** |
| ¿API expone? | **Sí** en DTO de listado/create/update |

**Por qué aparecen en null (demostrado):** se crean zonas desde servicios (095 backfill name/locality) y desde UI/`findOrCreate` **sin** pasar centroides; no hay job ni geocoder de zonas.

---

## 5. Flujo actual de creación y edición de localidades

1. **Admin UI** (`LocationZonesDialogContent`): POST/PATCH solo `name`, `locality`, `isActive`.
2. **API** (`location-zone.routes.ts`): permisos `employees:manage` \| `company:settings:update`.
3. **Servicios**: al crear/actualizar servicio con barrio/localidad, `findOrCreateByNameLocality` asegura fila en catálogo (centroides null).
4. **Empleados**: `EmployeeLocationZoneSelect` asigna `locationZoneId`.

No hay paso de geocoding en el ciclo de vida de zona.

---

## 6. Relación Localidad → Empleado

- Columna: `employees.location_zone_id` NULL FK → `location_zones.id`
- Trigger: `TR_employees_location_zone_company_scope` (misma empresa)
- Empleado **sin zona**: permitido; en recomendaciones → sin centroide → bucket `UNKNOWN` (feature omitido)

---

## 7. Relación Localidad → Servicio / Operación

- Servicio (`operational_locations`): `latitude`/`longitude` **exactos** (obligatorios en dominio), `location_zone_id` opcional, `neighborhood`/`locality` espejo.
- Operación: no tiene coords propias; la recomendación usa el **servicio** de la operación (`service.latitude/longitude` + `service.locationZoneId`).
- Prioridad efectiva **hoy** en scoring:

```text
1) SAME_ZONE si employee.locationZoneId === service.locationZoneId
2) Haversine(employee.zone.centroid, service.latitude/longitude)
3) UNKNOWN si faltan centroides o coords
```

No se usa el centroide del servicio (el servicio ya tiene punto exacto). No hay “coordenada de operación” separada.

---

## 8. Inconsistencias encontradas en el catálogo geográfico

| Caso | Riesgo | Notas |
|------|--------|-------|
| `Caballito / CABA` | Bajo | Query tipo `Caballito, Ciudad Autónoma de Buenos Aires, Argentina` |
| `Boedo / CABA`, `Palermo / CABA` | Bajo | Idem |
| `Bernal / GBA`, `Merlo / GBA` | Medio | `GBA` no es municipio; el geocoder necesita expansión (“Buenos Aires”) |
| `Centro / Capital\|Córdoba\|Salta` | **Alto** | Homónimos; `locality` es el desambiguador — hay que mapear Capital→CABA, etc. |
| `Castelar / Castelar` | Medio | Redundante pero usable |
| `Belgrano Residencial / Buenos Aires` | Medio | Nombre compuesto; puede caer en Belgrano CABA vs otro |
| `Centro` sin locality fuerte | **Alto** | Geocoding ambiguo |

**Severidad HIGH (catálogo):** `locality` es un **string libre** (`GBA`, `Capital`, `Buenos Aires`, `Castelar`) sin taxonomía controlada → geocoding no determinista sin tabla de expansión.

---

## 9. Geocoding existente

**Sí existe**, limitado a **servicios / reconciliación**:

- Archivo: `backend/src/utils/service-reconciliation/geocoding.ts`
- Proveedor: **Google Maps Geocoding API**
- Query: `officialAddress, neighborhood, locality, Argentina` + `region=ar` + `components=country:AR`
- Cache en archivo, delays, diagnostics (`geocodingStatus`, error codes)
- Env: `GOOGLE_MAPS_API_KEY` (preferido) o `VITE_GOOGLE_MAPS_API_KEY`

**No existe** cliente/geocoding para `location_zones`.

Nominatim / GeoRef / Mapbox: **no** aparecen como adapters de zonas.

---

## 10. Alternativas de proveedor

| Opción | Pros | Contras | Encaje AR barrios |
|--------|------|---------|-------------------|
| **A Nominatim/OSM** | Gratis, open | Rate limits estrictos, ToS, calidad variable barrios CABA | Media |
| **B Google Geocoding** | Ya en repo, region AR, calidad | Costo/cuotas, key management | Alta |
| **C GeoRef Argentina** | Oficial catálogo AR | Mejor para municipios/calles que barrios CABA; API distinta | Media-baja para barrios |

**Recomendación:** reutilizar **Google** (opción B) extrayendo un módulo compartido desde `service-reconciliation/geocoding.ts`, con queries específicas para zonas. Nominatim solo si se quiere evitar costo y se acepta peor precisión + rate limit.

---

## 11. Estrategia recomendada de geocoding

No buscar solo por `name`.

Query sugerida:

```text
{name}, {expandedLocality}, Argentina
```

Tabla de expansión mínima (config):

| locality normalizada | Expansión |
|----------------------|-----------|
| `caba`, `capital`, `ciudad autonoma...` | `Ciudad Autónoma de Buenos Aires` |
| `gba`, `buenos aires` (cuando name es partido/barrio GBA) | `Buenos Aires` / partido si se conoce |
| `córdoba` / `cordoba` | `Córdoba` |
| `salta` | `Salta` |

Reglas:

1. Preferir primer resultado con `location_type` / components que contenga el `name` (si la API lo permite).
2. Si confidence baja o múltiples candidatos → `FAILED` / `MANUAL`, no inventar.
3. **No LLM** como fuente de coordenadas.

---

## 12. Backfill de coordenadas existentes

**No** migration HTTP.

Recomendado:

- **Script/CLI one-shot** (o job admin) idempotente:
  - Selecciona `location_zones` con centroides null y (opcional) `geocodingStatus IS NULL/PENDING`
  - Geocodea con delay + cache
  - UPDATE solo si sigue null y no es `MANUAL`
  - Log por zona; continúa ante fallos
- Reejecutable; sin deploy bloqueante

Alternativa aceptable: endpoint admin “Geocodificar pendientes” + worker outbox (fase 2).

---

## 13. Flujo para nuevas localidades

```text
crear zona (name, locality) → persistir (PENDING / centroides null)
        ↓ async best-effort
geocode → RESOLVED | FAILED
```

- **Async** preferido: creación no depende del proveedor.
- Sync opcional con timeout corto + fallback PENDING.
- Zona usable sin centroide (recomendación degrada a UNKNOWN / SAME_ZONE si IDs coinciden).

---

## 14. Modelo de estados y errores

Hoy: **no hay** `geocodingStatus` en `location_zones`.

Campos con valor real (fase geocoding):

| Campo | Valor |
|-------|-------|
| `geocoding_status` | `PENDING` \| `RESOLVED` \| `FAILED` \| `MANUAL` |
| `geocoded_at` | timestamp |
| `geocoding_last_error` | texto corto |
| `geocoding_provider` | `GOOGLE` (opcional) |

`geocoding_attempts`: útil si hay worker con retry; si no, LOW prioridad.

---

## 15. Corrección manual

- API **ya permite** PATCH de centroides; UI **no**.
- Agregar UI + `MANUAL` para que re-geocode automático **no** sobrescriba.
- Clear centroides (null,null) permitido por schema (par conjunto).

---

## 16. Diseño del cálculo de distancia

**Ya existe:**

- `calculateDistanceMeters` (`utils/haversine.ts`)
- `distanceMetersBetween` + `resolveLocationProximityBucket` (`recommendation-scorer.ts`)
- Buckets (m): ≤2k VERY_CLOSE, ≤5k CLOSE, ≤15k MEDIUM, else FAR; SAME_ZONE sin distancia

No duplicar Haversine. Si se quiere `distanceKm` en reasons: `meters/1000` en params (fase explicabilidad).

---

## 17. Diseño de proximityScore

**Ya implementado** (no rangos 0–2 km → 100 enteros; scores [0,1]):

| Bucket | Score | Notas |
|--------|-------|-------|
| SAME_ZONE / VERY_CLOSE | 1 | SAME_ZONE no exige centroide |
| CLOSE | 0.75 | |
| MEDIUM | 0.45 | |
| FAR | 0.15 | |
| UNKNOWN | null | Omite feature; renormaliza pesos |

Peso relativo: `locationProximity: 0.25` junto a teamAffinity 0.45 y serviceExperience 0.3.

Función continua vs buckets: buckets actuales son **explicables y testeados**; cambiar a continua es opcional y versionaría el algoritmo.

---

## 18. Integración con el recommendation engine

Archivos:

- `individual-recommendation.service.ts` (líneas ~163–179): misma zona o distancia centroide→servicio
- `team-recommendation` / `team-composition-engine` / `team-scorer`: mismo concepto de bucket
- Reasons: `LOCATION_PROXIMITY` / `TEAM_LOCATION_PROXIMITY` con `params.bucket`

**Gap:** sin centroides, casi siempre `UNKNOWN` salvo SAME_ZONE por FK compartido.

No hace falta nuevo microservicio: completar datos y, opcionalmente, enriquecer `params` con `distanceMeters`.

---

## 19. Explicabilidad de recomendaciones

Frontend `recommendation-reasons.ts` ya traduce buckets a español (“muy cerca”, “cerca”, etc.).

**No** muestra km numéricos hoy. Mejora incremental: agregar `distanceMeters` al reason params cuando el bucket no es SAME_ZONE/UNKNOWN.

---

## 20. Privacidad

- Diseño intencional: **centroide de zona**, no domicilio.
- FE de recomendaciones no muestra lat/lng de empleados.
- Listado de zonas **sí** podría devolver centroides a quien gestiona zonas (permisos settings/employees).
- Preferir UI usuario: “Boedo · ~2.4 km”, no coordenadas.

---

## 21. Performance y escalabilidad

- 100–1000 Haversine en app: trivial.
- No hace falta geography SQL / spatial index en MVP.
- Cache de distancias zona↔servicio: opcional si N zonas × M servicios crece mucho.

---

## 22. SQL Server y alternativas espaciales

Mantener `DECIMAL` + Haversine en aplicación.

`geography` / `STDistance`: más complejidad de migración y queries; **no justificado** con el volumen actual.

---

## 23. Idempotencia / concurrencia / retries

Para backfill/worker:

- UPDATE condicional: solo si centroides null y status ≠ MANUAL
- Unique key zona ya existe; geocode cache por query string
- No dos writes conflictivos si se usa `WHERE centroid_latitude IS NULL`
- Rate limit Google: delay + cache (patrón ya en reconcile)

---

## 24. Observabilidad

Propuesto (alineado a eventos existentes del dominio):

```text
LOCATION_ZONE_GEOCODING_STARTED
LOCATION_ZONE_GEOCODING_RESOLVED
LOCATION_ZONE_GEOCODING_FAILED
LOCATION_ZONE_GEOCODING_SKIPPED_MANUAL
```

Campos: companyId, zoneId, query (sin PII extra), status, provider. Sin dumps de API key.

---

## 25. Tests existentes y faltantes

**Existen:**

- `location-zone.service.test.ts`, HTTP/integration location-zone
- `recommendation-scorer.test.ts` (buckets, UNKNOWN, SAME_ZONE)
- Individual/team recommendation integration tests
- Service reconciliation geocoding tests

**Faltan (prioridad):**

| Prioridad | Caso |
|-----------|------|
| P0 | Backfill/geocode zona exitoso → centroides persistidos |
| P0 | Zona sin centroide → UNKNOWN en recommendation |
| P0 | SAME_ZONE sin centroides aún aporta score |
| P1 | Ambiguos Centro/Córdoba vs Centro/CABA |
| P1 | Manual override no sobrescrito |
| P1 | Provider 429/5xx → FAILED, zona usable |
| P2 | Explicabilidad con km |

---

## 26. Riesgos

### Hallazgos clasificados

**1. BLOCKER (para valor de proximidad en prod)**  
- **Archivo:** `location-zone.service.ts` (`findOrCreateByNameLocality`), UI `LocationZonesDialogContent.tsx`, migración `095`  
- **Problema:** centroides casi siempre null → `locationProximity` inactivo salvo SAME_ZONE  
- **Impacto:** recomendaciones no discriminan Caballito vs Merlo por distancia  
- **Corrección:** geocoding zonas + backfill CLI + UI manual  

**2. HIGH**  
- **Archivo:** catálogo `locality` libre  
- **Problema:** `GBA` / `Capital` / homónimos `Centro`  
- **Impacto:** geocoding incorrecto  
- **Corrección:** mapa de expansión + rechazo a MANUAL si ambiguo  

**3. MEDIUM**  
- **Archivo:** FE zonas  
- **Problema:** API acepta centroides; UI no  
- **Impacto:** ops no puede corregir sin API  
- **Corrección:** campos lat/lng opcionales en diálogo  

**4. MEDIUM**  
- **Archivo:** `individual-recommendation.service.ts`  
- **Problema:** distancia es zona→**servicio**, no zona→zona  
- **Impacto:** correcto para “cerca del punto de trabajo”; distinto del ejemplo zona↔zona del prompt  
- **Corrección:** documentar; solo cambiar si producto pide zona↔zona  

**5. LOW**  
- Explicabilidad sin km numéricos  
- Sin status de geocoding en schema  

**6. INFO**  
- Geocoding Google de servicios ya existe y es reutilizable  
- Haversine y pesos V1 ya implementados  

---

## 27. Deuda técnica detectada

- Comentario 095 “Centroids NOT backfilled” dejó el feature de proximity a medias.
- Geocoding acoplado a `service-reconciliation` (CLI/reconcile), no a un `GeocodingPort` reusable.
- Normalización de locality no canónica (sin vocabulario).
- `Belgrano Residencial` y similares dependen de calidad del geocoder.

---

## 28. Cambios mínimos recomendados (MVP)

1. Extraer/adaptar geocoder Google a zonas (`name` + locality expandida + Argentina).
2. CLI/script backfill idempotente (no migration HTTP).
3. Tras create zona: encolar geocode async (o sync best-effort).
4. UI: editar/ver centroides + marcar MANUAL.
5. Observabilidad mínima de geocode.
6. Tests: UNKNOWN vs SAME_ZONE vs VERY_CLOSE con centroides reales.

**No requerido en MVP:** PostGIS, precompute matriz, LLM, nuevo algoritmo de pesos, microservicio.

---

## 29. Cambios opcionales futuros

- `distanceMeters` en reason params / copy “2.4 km”
- Taxonomía formal de `locality` (enum/catálogo)
- Worker outbox de geocoding
- Re-geocode batch admin
- Continuous proximity curve + bump de `algorithmVersion`
- Quality score / multi-result disambiguation

---

## 30. Plan de implementación por fases

### Fase A — Datos (desbloquea el scorer existente)

1. Geocode adapter zonas  
2. Backfill CLI  
3. Create-path async  
4. Manual UI + MANUAL lock  

### Fase B — Producto

1. Explicabilidad con km  
2. Métricas % zonas geocoded  
3. Dashboard fallos  

### Fase C — Refino

1. Taxonomía locality  
2. Versionado scores si cambian buckets  

---

## 31. Archivos concretos que deberían modificarse

| Archivo | Motivo |
|---------|--------|
| `backend/src/utils/service-reconciliation/geocoding.ts` (o nuevo `geocoding/`) | Reusar Google para zonas |
| `backend/src/services/location-zone.service.ts` | Hook post-create; no null forever |
| `backend/src/repositories/location-zone.repository.ts` | Update centroides / status |
| Nueva migration (fase A) | Columnas status/manual opcionales |
| `scripts/` o `backend/scripts/` | Backfill CLI |
| `frontend/.../LocationZonesDialogContent.tsx` | Lat/lng manual |
| Tests location-zone + recommendation | Cobertura geocode + UNKNOWN |
| Docs audit | Actualizar cuando se implemente |

**Probablemente sin cambio:** `recommendation-scorer.ts` (ya correcto), `haversine.ts`.

---

## 32. Veredicto final

### Respuestas directas

1. **`name` / `locality`:** barrio-zona / localidad-agrupador (documentado en `095`); strings libres.  
2. **Centroides:** aproximaciones de zona para AI proximity (094); opcionales.  
3. **Null hoy:** nunca se geocodean; UI/`findOrCreate`/095 no los cargan.  
4. **Geocoding:** sí para **servicios** (Google); no para zonas.  
5. **Empleado:** `employees.location_zone_id` nullable.  
6. **Servicio/ops:** servicio con lat/lng exactos + `location_zone_id`; ops vía servicio.  
7. **Mejor fuente:** Google Geocoding (ya integrado), con expansión de `locality`.  
8. **Backfill:** CLI/job idempotente, no migration HTTP.  
9. **Nuevas:** persistir primero; geocode async; no bloquear create.  
10. **`distanceKm`:** derivar de Haversine existente (hoy en metros).  
11. **`proximityScore`:** buckets V1 ya definidos.  
12. **Dónde integrar:** ya integrado; falta poblar centroides.  
13. **Sin coords:** UNKNOWN → omitir feature (no romper).  
14. **Ambiguos:** locality + mapa de expansión + MANUAL.  
15. **MVP prod:** Fase A (geocode zonas + backfill + manual).  
16. **Después:** km en UI, taxonomía, worker outbox, curve continua.

### Veredicto

El sistema **ya está diseñado** para cercanía determinística zona→servicio en recomendaciones. El bloqueo no es algorítmico: es **datos (centroides vacíos)** y **ausencia de pipeline de geocoding de zonas**. Completar eso es el cambio mínimo de alto impacto; no reinventar el motor ni usar LLM para distancias.

---

## Checklist de auditoría

| Ítem | Estado |
|-------|--------|
| Requirements coverage (proximity en scoring) | OK (código) / GAP (datos) |
| Backend thin routes / services | OK |
| Repository isolation | OK |
| Haversine centralizado | OK |
| Idempotencia MessageSid (attendance) | N/A a este stage |
| Geocoding zonas | GAP |
| UI centroides | GAP |
| Privacy (no domicilio exacto) | OK |
| Tests scorer | OK |
| Tests geocode zonas | GAP |
| LLM como geo truth | OK (no usado) |
| SQL geography | N/A (no necesario) |
