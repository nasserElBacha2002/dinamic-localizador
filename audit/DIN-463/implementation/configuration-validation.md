# Configuration validation

| Setting | Default | Location |
|---------|---------|----------|
| `COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE` | `DISABLED` | `env.ts`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` |
| Company override | `NULL` (sin configuración) | `company_settings.commercial_seat_quota_mode` |

ENFORCE effective only when global ENFORCE **and** company ENFORCE (matrix unit-tested).

Invalid raw values parse to DISABLED (fail-safe).

`EMPLOYEE_LEGACY_SEED_ALLOWED` required for `seed-employees.ts` (document in ops runbooks).