# Fase 2A — Validación DNS

**Timestamp:** 2026-11-02T11:39Z (consulta desde entorno de desarrollo)

## Registros observados

```text
dig +short dinamicoperations.com A
170.239.85.196

dig +short api.dinamicoperations.com A
170.239.85.196

dig +short app.dinamicoperations.com A
(vacío — NXDOMAIN / sin registro A)
```

```text
dig app.dinamicoperations.com +noall +answer
(sin sección ANSWER)
```

## Coherencia objetivo

Para Fase 2A, `app` debe apuntar al **mismo destino** que apex y API si comparten el mismo host Nginx:

| Host | IP esperada | Estado |
|------|-------------|--------|
| `@` / apex | `170.239.85.196` | OK |
| `api` | `170.239.85.196` | OK |
| `app` | `170.239.85.196` | **FALTA** |

## Acción requerida (proveedor DNS — p. ej. Hostinger)

```text
Tipo: A
Nombre: app
Valor: 170.239.85.196
TTL: 300–600 s (recomendado pre-cutover; no verificado TTL actual)
```

**Clasificación:** `EXTERNAL_ACTION_REQUIRED`

## Verificación post-creación

```bash
dig +short app.dinamicoperations.com A
# debe mostrar 170.239.85.196

dig +short dinamicoperations.com A
dig +short api.dinamicoperations.com A
# deben seguir coherentes
```

No continuar bootstrap HTTP hasta que `curl` resuelva `app.dinamicoperations.com`.
