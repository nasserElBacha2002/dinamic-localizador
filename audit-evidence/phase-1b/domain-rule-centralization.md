# Domain-rule centralization

| Rule | Source of truth | Drift |
|------|-----------------|-------|
| Geofence evaluate | `attendance-validation.ts` | OK |
| Review margin value | Should be company→env resolver | Bot uses env only (**CQ-001**) |
| Absence transitions | `absence-transitions.ts` | Good |
| Invitation CAS | repository pending-only | Good (embedded) |
| Attendance review transitions | `attendance.service` only | No shared table (CQ-013) |
| Permission catalog | `company-permissions.ts` | Good |
