# Location fraud / GPS spoofing review (LOC-P1-005)

## Classification

Historical: **PROBABLE** spoofing (client can supply false coordinates).  
Cryptographic proof of physical presence: **impossible** with browser/device GPS alone.

## Phase 4A invariant (preserved)

- Client cannot define authoritative `locationStatus` / `distanceMeters` / `validationStatus` / `punctualityStatus`.
- Server recomputes geofence + punctuality (`attendance.service` + `evaluate-attendance-check-in`).
- Schema accepts legacy derived fields then **strips** them (`createAttendanceSchema` transform).

## Signals available (without new collection)

coordinates, server timestamp, employee, operation, prior attendance, service coordinates, distance, source MessageSid.

## 4E decision on heuristics

**No automatic impossible-travel / shared-coordinate blocking in 4E.**

Rationale:

- High false-positive risk for inventory field ops (shared devices, weak GPS, multi-site days).
- Spec prefers audit flag / manual review over silent blocks without approved product design.
- Inventing antifraud without evidence violates “no inventar controles”.

## Residual

| Item | Classification |
|------|----------------|
| GPS spoofing / fake coordinates within radius | **ACCEPTED_RESIDUAL_RISK** |
| Client-derived authority | **REMEDIATED** (4A) — must remain intact |
| Exact GPS in general security logs | Avoid; prefer decision + distance bucket |

## Phase 5 retest

Confirm client-supplied validation fields still ignored; spoofing remains residual (honest).
