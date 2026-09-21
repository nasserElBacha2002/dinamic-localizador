# 4A.1 — Attendance authoritative validation

## Root cause
`POST /attendance` accepted and persisted client `validationStatus`, `locationStatus`, `distanceMeters`, `punctualityStatus`.

## Fix
- `createAttendanceSchema` is `.strict()` and only accepts evidence (lat/lon/receivedAt/ids/messageSid).
- `attendanceService.create` loads service coords + workday schedule + `geofencePolicyResolver`, runs `buildCheckInValidation`, persists server decision.
- Manual attendance flow unchanged (separate schemas/permissions).
- WhatsApp path already server-computed via `employee-workday-attendance.command` + `AttendanceCreatePersistInput`.
- Frontend test form no longer sends derived fields.

## Files
- backend/src/schemas/attendance.schema.ts
- backend/src/services/attendance.service.ts
- backend/src/repositories/attendance.repository.ts
- frontend attendance create form/types
