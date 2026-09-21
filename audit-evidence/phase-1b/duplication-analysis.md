# Duplication analysis

## Clusters (business)

1. **Geofence review margin** — env vs company settings vs `geolocation.service` (CQ-001–003).
2. **Dual API mounts** — same routers twice (surface duplication, not logic copy).
3. **Punctuality** — write-time TS vs read-time SQL classification of stored statuses (acceptable split).
4. **Permission checks** — repeated `requirePermission` per route (intentional explicitness).

## Non-findings
Copy-paste of pagination helpers / Zod uuid params — trivial.
