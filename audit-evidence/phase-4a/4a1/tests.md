# Tests 4A.1

`backend/src/services/attendance-authoritative-validation.test.ts`

- far coords → REJECTED / OUTSIDE (server distance)
- schema rejects client distance/status fields
- late arrival → OUTSIDE_TIME_WINDOW / REJECTED with INSIDE geofence
