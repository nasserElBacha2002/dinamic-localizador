# Adjuntos de ausencias — Google Cloud Storage

Documentación operativa para la Fase 4 del módulo de Ausencias. Los bytes de los comprobantes viven **solo** en un bucket **privado** de GCS. SQL Server guarda metadata, checksum, object key y auditoría.

## Principios

- Bucket privado (nunca público).
- Sin filesystem local productivo, sin base64 en SQL, sin URLs públicas permanentes.
- Feature flag `absence_attachments_enabled` **desactivado por defecto**.
- Activación por empresa con script, después de validar readiness.

## 1. Crear el bucket

Región recomendada: la misma región del runtime (p. ej. `southamerica-east1` si el backend corre en São Paulo / LatAm).

```bash
gcloud storage buckets create gs://<BUCKET_NAME> \
  --project=<GCS_PROJECT_ID> \
  --location=<REGION> \
  --uniform-bucket-level-access
```

## 2. Seguridad del bucket (obligatorio)

Configurar en la consola o con `gcloud`:

| Control | Valor |
|---|---|
| Public Access Prevention | **enforced** |
| Uniform bucket-level access | **habilitado** |
| `allUsers` / `allAuthenticatedUsers` | **sin permisos** |
| Cifrado en reposo | Google-managed (default) |
| HTTPS | obligatorio para todas las operaciones |

```bash
gcloud storage buckets update gs://<BUCKET_NAME> --public-access-prevention
```

Versionado de objetos: solo si hay necesidad operativa real. Lifecycle: opcional para abortar multipart incompletos / objetos temporales.

La aplicación **nunca** construye URLs del tipo `https://storage.googleapis.com/<bucket>/<object>` para consumo permanente.

## 3. Service account e IAM mínimo

Crear una service account dedicada (ej. `dinamic-absence-attachments`).

Permisos equivalentes a:

- crear objetos
- leer objetos autorizados
- consultar metadata
- eliminar objetos en limpieza controlada
- firmar URLs (si se usa ese modo más adelante)

Preferir un custom role o, como mínimo práctico, `roles/storage.objectUser` sobre el bucket (no `roles/storage.admin` / `roles/owner` / `roles/editor`).

No listar el bucket completo sin prefijo controlado.

## 4. Variables de entorno

```env
GCS_PROJECT_ID=
GCS_BUCKET_NAME=
GCS_STORAGE_PREFIX=absence-attachments
GCS_SIGNED_URL_EXPIRATION_SECONDS=300
GCS_MAX_FILE_SIZE_BYTES=5242880
GCS_MAX_FILES_PER_REQUEST=5
GCS_MAX_TOTAL_SIZE_BYTES=15728640
GCS_UPLOAD_MODE=BACKEND_STREAM
ABSENCE_ATTACHMENT_CLEANUP_JOB_ENABLED=true
ABSENCE_ATTACHMENT_PENDING_TTL_MINUTES=60
```

### Desarrollo local

Patrón alineado con `dinamic-gemini`:

1. Colocá el JSON real en `secrets/gcp-service-account.json` (raíz del repo).
2. Configurá:

```env
# Docker Compose (default en .env.example)
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcp-service-account.json

# Local sin Docker (desde backend/)
# GOOGLE_APPLICATION_CREDENTIALS=../secrets/gcp-service-account.json
```

3. `docker-compose.yml` monta `./secrets:/app/secrets:ro` en el backend.

Solo se versionan `secrets/README.md` y `secrets/gcp-service-account.json.example`. El `.gitignore` excluye el JSON real y cualquier `*service-account*.json`.

Ver `secrets/README.md`.

### Producción

Preferir Application Default Credentials vía:

- Workload Identity
- service account adjunta al runtime (GCE/GKE/Cloud Run)

## 5. Object keys

Formato (opaco, aislado por empresa):

```text
<storagePrefix>/companies/<companyId>/absence-requests/<requestId>/attachments/<attachmentId>/original
```

El nombre original del archivo no forma parte del path.

## 6. Flujo de upload (`BACKEND_STREAM`)

```text
cliente → multipart/form-data → backend → validación (tamaño, MIME magic, checksum)
→ stream/put a GCS (ifGenerationMatch=0) → verificar metadata → SQL AVAILABLE
```

Descarga: backend autenticado → autorización → stream desde GCS → cliente.

Headers: `Content-Type`, `Content-Length`, `Content-Disposition`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`.

## 7. Feature flag y activación

1. Crear bucket + IAM.
2. Configurar variables.
3. Validar `GET /api/health/ready` (GCS `available`).
4. Aplicar migración `066_absence_phase4_gcs_attachments.sql`.
5. Activar empresa piloto:

```bash
cd backend
npx tsx --import ./src/test-helpers/preload-test-env.ts \
  src/scripts/enable-absence-attachments.ts --company=<uuid>
```

6. Validar upload / download / delete.
7. Activar progresivamente.

También se puede toglear `absenceAttachmentsEnabled` desde Configuración → Ausencias (requiere `company:settings:update`) **solo si GCS está disponible**.

## 8. Políticas por tipo

En Configuración → Ausencias → Políticas por tipo:

- `FORBIDDEN` | `OPTIONAL` | `REQUIRED`

Migración conservadora: `requires_attachment=1` → `REQUIRED`, resto → `OPTIONAL`.

## 9. Antivirus

GCS no ofrece antivirus. En esta fase `scan_status=UNSCANNED` siempre (nunca se declara `CLEAN` sin scanner real). Allowlist estricta: PDF, JPEG, PNG, WEBP. Riesgo residual: un archivo allowlisted puede contener contenido malicioso; mitigar con allowlist + bucket privado + sin ejecución. Arquitectura lista para scanner asíncrono (`QUARANTINED` → scan → `AVAILABLE`/`REJECTED`).

## 9b. Flujo draft → upload → submit

Cuando la política es `REQUIRED` (o se adjuntan archivos opcionales), la creación admin usa:

1. `POST /absence-request-drafts` — no consume saldo ni reconcilia jornadas
2. `POST /absence-request-drafts/:id/attachments` + header `Idempotency-Key` (streaming multipart)
3. `POST /absence-request-drafts/:id/submit` — valida docs, crea la solicitud y recién ahí puede autoaprobar

La autoaprobación **nunca** ocurre antes de satisfacer `attachment_policy_snapshot`.

## 9c. Portal de empleado (web)

**No implementado.** No existe autenticación de colaborador self-service para adjuntos web. El canal soportado para colaboradores es **WhatsApp**. Las rutas HTTP de adjuntos requieren `absences:review` (admin/RRHH). No declarar el flujo web de empleado como completado.

## 10. Job de limpieza

`absence-attachment-cleanup.job` procesa `PENDING_UPLOAD` / `UPLOADING` abandonados, `FAILED` y `PENDING_DELETE` con claim por lease (`UPDLOCK`/`READPAST`). **No** elimina objetos `AVAILABLE`.

## 11. Rollback

SQL: `database/migrations/rollback/066_absence_phase4_gcs_attachments_rollback.sql`

El rollback **no** borra objetos GCS. Generar reporte de object keys huérfanos desde SQL antes del drop:

```sql
SELECT company_id, object_key, status, created_at
FROM dbo.absence_request_attachments;
```

## 12. Troubleshooting

| Síntoma | Acción |
|---|---|
| `GCS_NOT_CONFIGURED` | Revisar `GCS_PROJECT_ID` / `GCS_BUCKET_NAME` |
| `GCS_PERMISSION_DENIED` | Revisar IAM de la identidad ADC |
| Upload OK, status FAILED | Ver cleanup job / logs de markAvailable |
| Ready `degraded` | Bucket inaccesible; adjuntos rechazados, resto del sistema sigue |

## 13. Rotación de credenciales

Rotar la key de la service account o el binding de Workload Identity sin cambiar el bucket. Reiniciar el backend para refrescar el cliente GCS.

## 14. WhatsApp

Media de Twilio se descarga con auth de Twilio, se valida y se copia a GCS (`source=WHATSAPP`). Idempotencia: `(company_id, twilio_message_sid, twilio_media_index)`. La URL de Twilio no se usa como almacenamiento.
