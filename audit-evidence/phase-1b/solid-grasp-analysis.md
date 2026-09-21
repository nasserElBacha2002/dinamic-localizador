# SOLID / GRASP analysis

## SRP
Orchestration services (checkout flow, reminders, invitations) mix persistence, notifications, and rules — expected for transaction scripts; violates textbook SRP but matches Express layered style.

## OCP
Provider switches limited; Twilio outbound centralized. Attendance modes (bot/manual/HTTP create) diverge validation — OCP pressure (CQ-001/002).

## LSP / ISP
Repository interfaces are concrete classes (no wide unused interfaces). Strategy pattern used for imports (`imports/registry.ts`) — good OCP example.

## DIP
Services import `env`, `mssql`, Twilio helpers directly — testability via module mocks; not abstracted ports. Acceptable for size; hurts pure unit isolation.

## GRASP
- **Information Expert:** geofence evaluation in `attendance-validation.ts` — good.
- **Controller:** thin Express controllers — generally OK.
- **Protected Variations:** Twilio media URL allowlist — good (SSRF).
- **Low Coupling:** eroded where services reach multiple repos + outbound in one method.
