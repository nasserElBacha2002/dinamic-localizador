# GitHub Actions y CI/CD

Este proyecto usa **`develop` como rama de despliegue al servidor**. La rama `main` no dispara deploy automático.

## Flujo de trabajo

```text
feature/* → PR contra develop → validaciones CI → merge → deploy automático (SSH)
```

## Workflows

| Archivo | Cuándo corre | Qué hace |
|---------|--------------|----------|
| `pr-validation.yml` | PR a `develop` o `main` | lint, build, tests, validación Docker Compose |
| `deploy-backend.yml` | push a `develop` (cambios backend/database) | valida, SSH, `git reset` a `origin/develop`, migraciones, rebuild backend |
| `deploy-frontend.yml` | push a `develop` (cambios frontend) | valida, SSH, `git reset` a `origin/develop`, rebuild frontend |

### Jobs requeridos para branch protection

Configurar en GitHub como **required status checks**:

- `backend-validation`
- `frontend-validation`
- `docker-validation`

## Secrets requeridos (Settings → Secrets and variables → Actions)

| Secret | Descripción |
|--------|-------------|
| `DEPLOY_HOST` | IP o hostname del servidor |
| `DEPLOY_USER` | Usuario SSH (ej. `nasser`) |
| `DEPLOY_SSH_KEY` | Clave privada SSH (deploy key) |
| `DEPLOY_PORT` | Puerto SSH (opcional, default `22`) |
| `DEPLOY_PATH` | Ruta del repo en el servidor: `/opt/dinamic-attendance/dinamic-localizador` |

## Variables opcionales (Repository variables)

| Variable | Default en script | Descripción |
|----------|-------------------|-------------|
| `DEPLOY_BACKEND_HEALTH_URL` | `http://127.0.0.1:3004/api/health` | Health check backend en el servidor |
| `DEPLOY_FRONTEND_HEALTH_URL` | `http://127.0.0.1:8084/` | Health check frontend en el servidor |

Ajustar si los puertos en `.env` del servidor son distintos.

## Environment de GitHub (opcional)

Los workflows de deploy usan `environment: production`. Crear en **Settings → Environments → New environment** un environment llamado `production` para auditoría y protección adicional de deploys.

## Configuración del servidor

Antes del primer deploy automático:

1. Clonar el repo en `DEPLOY_PATH`.
2. Dejar el servidor en la rama `develop`:

   ```bash
   cd /opt/dinamic-attendance/dinamic-localizador
   git checkout develop
   git pull origin develop
   ```

3. Tener `.env` configurado en la raíz (no commitear).
4. El usuario SSH debe poder ejecutar `docker compose` sin contraseña (grupo `docker`).
5. El servidor debe poder hacer `git fetch` desde GitHub (deploy key o credenciales).

### Deploy manual (equivalente al workflow)

Backend:

```bash
cd /opt/dinamic-attendance/dinamic-localizador
git fetch origin develop && git checkout develop && git reset --hard origin/develop
bash .github/scripts/deploy-backend.sh
```

Frontend:

```bash
cd /opt/dinamic-attendance/dinamic-localizador
git fetch origin develop && git checkout develop && git reset --hard origin/develop
bash .github/scripts/deploy-frontend.sh
```

## Protección de rama `develop`

En **Settings → Branches → Add branch protection rule**:

**Branch name pattern:** `develop`

Activar:

- Require a pull request before merging
- Require approvals (recomendado: 1)
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Require conversation resolution before merging
- Block force pushes
- Block deletions

**Required status checks:**

- `backend-validation`
- `frontend-validation`
- `docker-validation`

## Validación local (antes de abrir PR)

```bash
cp .env.example .env
# completar variables vacías requeridas por docker-compose.prod.yml (ver pr-validation.yml)
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml config
rm -f .env
```

## Notas

- La validación Docker en CI parte de `.env.example` y completa solo los secretos vacíos necesarios para `docker compose config`.
- Los workflows de deploy usan `environment: production` en GitHub para auditoría opcional.
- `main` puede existir como rama estable, pero **no deploya al servidor** con esta configuración.
