# Phase 4B — Residual risks

## P1

None newly opened for remediations in scope.

## P2 / residual

1. **CQ-004** — JWT remains in `localStorage`. Not remediated.
2. **LOC-P1-015 original finding = REMEDIATED** — server logout + `token_version` + live DB role revoke stolen JWT until expiry.  
   **Broader session architecture = RESIDUAL** — no refresh-token rotation / session table (do not reopen LOC-P1-015 for this).  
   **CQ-004 = RESIDUAL** — JWT still in `localStorage`.
3. **Duplicate external side effects (NOT exactly-once)**  
   Distributed tick lock ≠ exactly-once Twilio/email delivery.  
   Scenario: provider accepts send → process crashes before DB final mark → retry may send again.  
   Reminder CAS/claim reduces risk; residual remains. Do not claim exactly-once.
4. Membership deactivate does not bump global `token_version` (other companies may remain valid; company routes re-check membership).
5. Process-local `isRunning` may remain as a secondary hint on already-leased jobs.
