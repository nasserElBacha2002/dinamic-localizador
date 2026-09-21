# Quality findings (CQ-*)

## CQ-001 — Bot ignores company geofence review margin
| Field | Value |
|-------|-------|
| Severity | HIGH |
| Classification | DEFECTO_CONFIRMADO |
| Type | CORRECTNESS_DEFECT |
| Category | domain-rules |
| File | `backend/src/services/bot-runtime-settings.service.ts` |
| Line | 27 |
| Impact | Company setting unused; env margin always applied |
| Root cause | config dual-home without single resolver on bot path |
| Variants | 3 |
| Confidence | HIGH |
| Recommended | Use companyOperationalDefaultsResolver in bot runtime |

## CQ-002 — geolocation.service uses env radius/margin only
| Field | Value |
|-------|-------|
| Severity | MEDIUM |
| Classification | DEFECTO_CONFIRMADO |
| Type | CORRECTNESS_DEFECT |
| Category | domain-rules |
| File | `backend/src/services/geolocation.service.ts` |
| Line | 22 |
| Impact | Divergent geofence path |
| Root cause | duplicate geofence entrypoints |
| Variants | 2 |
| Confidence | HIGH |
| Recommended | Route through shared defaults resolver |

## CQ-003 — Bot simulator hardcodes env review margin
| Field | Value |
|-------|-------|
| Severity | MEDIUM |
| Classification | DEFECTO_CONFIRMADO |
| Type | CORRECTNESS_DEFECT |
| Category | domain-rules |
| File | `backend/src/services/bot-simulator.service.ts` |
| Line | 430 |
| Impact | Simulator ≠ production company settings |
| Root cause | same as CQ-001 |
| Variants | 1 |
| Confidence | MEDIUM |
| Recommended | Align simulator with resolver |

## CQ-004 — JWT stored in localStorage
| Field | Value |
|-------|-------|
| Severity | MEDIUM |
| Classification | DEFECTO_CONFIRMADO |
| Type | SECURITY_DEFECT |
| Category | frontend |
| File | `frontend/src/api/token-storage.ts` |
| Line | 7 |
| Impact | XSS would steal session token |
| Root cause | token storage choice |
| Variants | 1 |
| Confidence | HIGH |
| Recommended | Prefer memory/httpOnly cookie pattern if feasible |

## CQ-005 — Settings load failure falls back to env silently
| Field | Value |
|-------|-------|
| Severity | MEDIUM |
| Classification | RIESGO_PROBABLE |
| Type | RELIABILITY_RISK |
| Category | exceptions |
| File | `backend/src/services/bot-runtime-settings.service.ts` |
| Line | 62 |
| Impact | Attendance rules change without loud failure |
| Root cause | fail-open defaults |
| Variants | 1 |
| Confidence | MEDIUM |
| Recommended | Fail closed or alert on settings read errors |

## CQ-006 — Absence impact query failure returns []
| Field | Value |
|-------|-------|
| Severity | MEDIUM |
| Classification | RIESGO_PROBABLE |
| Type | RELIABILITY_RISK |
| Category | exceptions |
| File | `backend/src/services/absence-request.service.ts` |
| Line | 522 |
| Impact | Operators miss operational conflicts |
| Root cause | swallow to empty |
| Variants | 1 |
| Confidence | MEDIUM |
| Recommended | Surface error to UI |

## CQ-007 — Checkout attendance flow god module
| Field | Value |
|-------|-------|
| Severity | LOW |
| Classification | DEFECTO_CONFIRMADO |
| Type | ARCHITECTURAL_DEBT |
| Category | god-module |
| File | `backend/src/services/bot/checkout-attendance.flow.ts` |
| Line | 1 |
| Impact | High change/regression cost |
| Root cause | orchestration concentration |
| Variants | 8 |
| Confidence | HIGH |
| Recommended | Split validation vs messaging gradually |

## CQ-008 — WhatsApp correlate timeout swallowed
| Field | Value |
|-------|-------|
| Severity | LOW |
| Classification | RIESGO_PROBABLE |
| Type | RELIABILITY_RISK |
| Category | async |
| File | `backend/src/services/whatsapp-bot.service.ts` |
| Line | 512 |
| Impact | Lost observability correlation |
| Root cause | fire-and-forget |
| Variants | 2 |
| Confidence | MEDIUM |
| Recommended | Metric on swallow |

## CQ-009 — Twilio media fetch SSRF
| Field | Value |
|-------|-------|
| Severity | INFO |
| Classification | DESCARTADO |
| Type | CODE_SMELL |
| Category | ssrf |
| File | `absence-attachment-whatsapp.service.ts` |
| Line | 59 |
| Impact | N/A — controls present |
| Root cause | n/a |
| Variants | 0 |
| Confidence | HIGH |
| Recommended | Keep allowlist tests |

## CQ-010 — Frontend HTML sinks
| Field | Value |
|-------|-------|
| Severity | INFO |
| Classification | DESCARTADO |
| Type | CODE_SMELL |
| Category | xss |
| File | `frontend/src` |
| Line | 0 |
| Impact | No sinks found |
| Root cause | n/a |
| Variants | 0 |
| Confidence | HIGH |
| Recommended | Keep lint bans |

## CQ-011 — Attendance lacks shared transition table
| Field | Value |
|-------|-------|
| Severity | INFO |
| Classification | DEFECTO_CONFIRMADO |
| Type | MAINTAINABILITY |
| Category | state-machine |
| File | `backend/src/services/attendance.service.ts` |
| Line | 240 |
| Impact | Harder to audit than absences |
| Root cause | embedded transitions |
| Variants | 1 |
| Confidence | MEDIUM |
| Recommended | Extract transition module |

## CQ-012 — Reliability scanner returned 0 (FN risk)
| Field | Value |
|-------|-------|
| Severity | LOW |
| Classification | RIESGO_PROBABLE |
| Type | AUDIT_READINESS |
| Category | scanners |
| File | `scripts/audit/framework/scanners/reliability.py` |
| Line | 0 |
| Impact | False sense of reliability cleanliness |
| Root cause | heuristic miss |
| Variants | 1 |
| Confidence | MEDIUM |
| Recommended | Tune paths; keep manual review |
