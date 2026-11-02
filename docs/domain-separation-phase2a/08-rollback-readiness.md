# Fase 2A — Rollback readiness

Rollback de Fase 2A **no** debe requerir rollback de backend env, website rebuild, DB ni Twilio (no modificados en 2A).

## Si falla `app.*`

1. **No tocar** configuración apex.
2. Restaurar backup timestamped de `sites-available/app.dinamicoperations.com` si existía.
3. O deshabilitar solo el site app:

```bash
sudo rm /etc/nginx/sites-enabled/app.dinamicoperations.com
# opcional: conservar sites-available para reintento

sudo nginx -t
sudo systemctl reload nginx
```

4. DNS: dejar registro `app` apuntando al servidor sin vhost, o eliminar registro si se aborta cutover.

## Certificado app

Revocar certificado app es opcional; no afecta certs apex/api si no se tocaron.

## Plantilla legacy apex (emergencia unificada)

Solo emergencia global — **no** usar como paso normal de rollback 2A:

- `deploy/nginx.dinamicoperations.com.legacy-unified.conf.template`
- `deploy/nginx.bootstrap.dinamicoperations.com.legacy-unified.conf.template`

Ver [10-rollback-plan.md](../domain-separation-audit/10-rollback-plan.md).

## Logs durante incidente

```bash
sudo journalctl -u nginx --since "30 minutes ago" --no-pager
sudo tail -n 200 /var/log/nginx/error.log
```

Buscar: `502`, `SSL`, `certificate`, `upstream`, `app.dinamicoperations.com`.

## Estado actual

```text
ROLLBACK_NOT_NEEDED — cambios Nginx app no aplicados en producción.
```
