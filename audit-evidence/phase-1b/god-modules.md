# God modules

| Module | LOC | Responsibilities mixed | Risk |
|--------|----:|------------------------|------|
| `bot/checkout-attendance.flow.ts` | 1313 | Location, geofence, session, WhatsApp, TX | Hard to test transitions |
| `operation-assignment.service.ts` | 1196 | Assign/cancel/batch, materialization, TX | Concurrency + notifications |
| `attendance-reminder.service.ts` | 1189 | Claim, Twilio, recovery, multi kinds | Idempotency critical |
| `recurring-workday-materialization.service.ts` | 1161 | Horizon + reconcile events | Multi-instance (LOC-P1-004) |
| `operation.service.ts` | 1088 | CRUD recurring/one-time, lifecycle | Divergent change |
| `user-invitation.service.ts` | 1034 | Lifecycle + email + CAS | Token security adjacent |
| `payroll-receipt.service.ts` | 950 | GCS + batch + reconcile | File authz |
| `absence-request.service.ts` | 949 | Admin+WA create, review, balance | State machine spread |

These are **ARCHITECTURAL_DEBT** unless paired with a correctness defect.
