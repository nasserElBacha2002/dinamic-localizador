# Commercial policy validation (static + partial dynamic)

| Scenario | Expected | Implementation reference | SQL executed |
|----------|----------|--------------------------|--------------|
| Global DISABLED | No quota SQL on create fast-path | `getGlobalMode()` early return | No |
| Exempt / enforceSeatLimit false | Skip | `billingPolicyService` | No |
| seat_max NULL | Unlimited | `resolveCapacity` | No |
| No subscription | Allow + INCONSISTENCY | `resolveCapacity` | Integration test (skip in CI env) |
| seat_max finite ENFORCE | Reject overflow | `COMMERCIAL_SEAT_LIMIT_EXCEEDED` | Integration test (skip) |
| Mode matrix | Per DIN-463 table | `resolve-effective-commercial-seat-mode.test.ts` | **PASS** |