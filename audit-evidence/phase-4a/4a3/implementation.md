# 4A.3 — Distributed rate limiting

## Root cause
In-memory `Map` per process.

## Fix
- `rate_limit_buckets` SQL table (migration 140).
- `RateLimitStore` interface: SQL (default) + memory (tests / RATE_LIMIT_BACKEND=memory).
- Atomic UPDLOCK/HOLDLOCK hit.
- Store failure → **fail_closed** 503 `RATE_LIMIT_STORE_UNAVAILABLE` (logged).

No Redis introduced (not in infra).
