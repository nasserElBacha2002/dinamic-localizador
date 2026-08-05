# Credenciales GCP (local / Docker)

Misma convención que en `dinamic-gemini`. El JSON real **nunca** se versiona.

## Rutas

| Contexto | Path |
|---|---|
| Contenedor (Docker Compose) | `/app/secrets/gcp-service-account.json` |
| Host (raíz del repo) | `secrets/gcp-service-account.json` |
| Backend local (`cd backend && npm run dev`) | `../secrets/gcp-service-account.json` |

## Setup

1. En [Google Cloud Console](https://console.cloud.google.com/) → IAM → Service Accounts, crear o elegir una SA con acceso mínimo al bucket de adjuntos (p. ej. object create/read/delete sobre el bucket; no `roles/storage.admin`).
2. Crear una key JSON y descargarla.
3. Guardarla como:

```text
secrets/gcp-service-account.json
```

4. Copiá el ejemplo si necesitás ver la forma del archivo:

```bash
cp secrets/gcp-service-account.json.example secrets/gcp-service-account.json
# reemplazar con el JSON real de GCP
```

5. En `.env` (raíz) o `backend/.env`:

```env
# Docker Compose
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcp-service-account.json

# Local sin Docker (desde backend/)
# GOOGLE_APPLICATION_CREDENTIALS=../secrets/gcp-service-account.json

GCS_PROJECT_ID=tu-proyecto
GCS_BUCKET_NAME=tu-bucket-privado
```

6. `docker-compose.yml` y `docker-compose.prod.yml` montan `./secrets:/app/secrets:ro` en el servicio `backend` (solo lectura). En prod no se monta el código fuente; solo esta carpeta de credenciales.

**Nunca subas** `gcp-service-account.json` a GitHub. Solo se trackean `README.md` y `gcp-service-account.json.example`.

Ver también: `docs/absence-attachments-gcs.md`.
