# Residual risks

1. Invitation deep-link still uses `?token=` in email URLs (design constraint).
2. SQL rate-limit multi-replica invariant verified via shared-store unit test; apply migration 140 before enabling sql backend in production.
3. Geofence/settings DB outages return 503 (fail-closed) — may temporarily block bot/attendance until DB recovers.
4. JWT localStorage / job locking / legacy mounts out of 4A scope.
