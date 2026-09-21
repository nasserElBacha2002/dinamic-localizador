# Validation consistency

| Rule | Bot/WhatsApp | Manual attendance | HTTP POST /attendance | Notes |
|------|--------------|-------------------|-----------------------|-------|
| Geofence | Server Haversine + margin | Server-derived statuses | Client statuses accepted | LOC-P1-002 / CQ-001 |
| Assignment | Required | Required | Required | OK |
| Time window | Server | Server | Not recomputed with statuses | Defect path |
| Phone E.164 | Bot resolve | N/A | N/A | OK |
| Zod schemas | N/A (Twilio form) | Strict manual schema | createAttendanceSchema includes enums | Divergent |

Frontend length/enum checks may differ; backend Zod is authority.
