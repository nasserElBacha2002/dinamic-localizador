# 4B.3 — Swallowed error inventory

| Path | Action |
|---|---|
| absence getById affected ops catch→[] | → ABSENCE_AFFECTED_OPERATIONS_UNAVAILABLE |
| absence getById balance catch→null | → ABSENCE_BALANCE_IMPACT_UNAVAILABLE |
| whatsapp-flow-trace catch→null | intentional soft (left) |
| health readiness → false | intentional (left) |
| job-tick catch→null | intentional (left) |
