# setup-github-ci-cd

**ROLE**  
You are a senior DevOps/full-stack engineer working on the Dinamic Attendance / WhatsApp Localizador project.

**PRIMARY GOAL**  
Implement or update GitHub Actions, branch protection documentation, and deploy workflows for:

1. Pull Request validation before merging.
2. Automatic backend deployment from `develop`.
3. Automatic frontend deployment from `develop`.
4. Safe validation: install, lint (where available), TypeScript/build, tests, Docker Compose config.

**CRITICAL BRANCH RULE**

- The server deploys from **`develop`**, not `main`.
- Deploy workflows run only on push to `develop`.
- PR validation runs on PRs targeting `develop` and `main`.
- Server deploy must `git fetch` + `git reset --hard origin/develop`.

---

## PROJECT CONTEXT

- Backend: `backend/` (Node 20, TypeScript, `npm run build`, `npm test`)
- Frontend: `frontend/` (Vite, `npm run lint`, `npm run build`, `npm test`)
- Docker Compose: `docker-compose.yml` + `docker-compose.prod.yml`
- Production path: `/opt/dinamic-attendance/dinamic-localizador`
- Compose services: `backend`, `frontend`, `migrations`, `sqlserver`
- Health: `http://127.0.0.1:3004/api/health` (backend), `http://127.0.0.1:8084/` (frontend) — adjust via repo variables

---

## REQUIRED FILES

```text
.github/
  workflows/
    pr-validation.yml
    deploy-backend.yml
    deploy-frontend.yml
  scripts/
    deploy-backend.sh
    deploy-frontend.sh
  pull_request_template.md
docs/github-actions.md
```

Use root `.env.example` as the env source for Docker Compose validation in CI (copied to a temporary `.env`).

Do not create a separate `.github/ci.env`.

Do not create `deploy-full.yml` unless separate deploys are unreliable.

---

## WORKFLOW REQUIREMENTS

### `pr-validation.yml`

Jobs (exact names for branch protection):

- `backend-validation` — `npm ci`, `npm run build`, `npm test` in `backend/`
- `frontend-validation` — `npm ci`, `npm run lint`, `npm run build`, `npm test` in `frontend/`
- `docker-validation` — copy `.env.example` to `.env`, fill empty required secrets for prod compose, then `docker compose config`

### `deploy-backend.yml`

- Trigger: push to `develop`, paths `backend/**`, `database/**`, compose files
- Validate before deploy
- SSH using secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`, `DEPLOY_PATH`
- On server: verify branch `develop`, `git reset --hard origin/develop`, run `.github/scripts/deploy-backend.sh`
- Script: migrations → build backend → up backend → health check

### `deploy-frontend.yml`

- Trigger: push to `develop`, paths `frontend/**`, compose files
- Validate before deploy
- Same SSH/git pattern
- Script: build frontend → up frontend → health check

---

## GITHUB SECRETS TO DOCUMENT

- `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PORT`, `DEPLOY_PATH`
- Optional variables: `DEPLOY_BACKEND_HEALTH_URL`, `DEPLOY_FRONTEND_HEALTH_URL`

Never hardcode secrets in workflows.

---

## PR TEMPLATE

Spanish template with: Resumen, Cambios, Validaciones, Impacto, Checklist, Notas para reviewer.

---

## POST-IMPLEMENTATION

1. Run local validations.
2. Generate review artifacts under `review/` with task name `github-ci-cd-develop-deploy`.
3. Document branch protection for `develop` in `docs/github-actions.md`.

---

## OUTPUT FORMAT

Return: **Implementation report**, **Git review artifacts generated**, **Review package**.

---

# NOW EXECUTE

Implement or update GitHub CI/CD for this project. Deploy branch is `develop` only.
