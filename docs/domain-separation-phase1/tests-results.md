# Tests results — Phase 1 (post review fixes)

| Command | Result | Notes |
|---------|--------|-------|
| `cd website && npm test` | **PASS** | 39 tests (incl. `nginx-domain-templates.test.ts`) |
| `cd backend && npx tsx --test` (CORS + email URLs) | **PASS** | (sin re-ejecutar en este patch; previo PASS) |
| `python3 scripts/validate-docker-compose-backend-env.py` | **PASS** | Tras restaurar `DB_HOST` |
| `cd backend && npm run build` | **PASS** | |
| `cd frontend && npm run lint` | **PASS** | 0 errors, warnings preexistentes |
| `cd website && npm run lint` | **PASS** | |
| `cd frontend && npm test` | **NOT_RUN** | Recomendado en CI quality-gate |
| Full `quality-gate.yml` local | **NOT_RUN** | Ejecutar en PR |
