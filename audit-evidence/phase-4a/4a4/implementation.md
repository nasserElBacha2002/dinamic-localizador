# 4A.4 — Unified geofence policy

## Root cause
Bot runtime / geolocation.service / simulator used env margin; company settings ignored.

## Fix
- `geofencePolicyResolver` — single precedence (service radius → company → env; margin company → env).
- Load errors → `GEOFENCE_POLICY_UNAVAILABLE` (no silent fallback).
- Consumers: bot-runtime-settings, geolocation.service, bot-simulator, attendance HTTP create.
