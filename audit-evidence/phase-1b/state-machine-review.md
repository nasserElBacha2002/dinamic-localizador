# State machine review

## Attendance validation_status
Write: VALID | PENDING_REVIEW | REJECTED. Review: PENDING_REVIEW|REJECTED → VALID|REJECTED. Guards in service (409 if already reviewed).

## Absence requests
Centralized transitions in `constants/absence-transitions.ts` (APPROVE/REJECT/NEEDS_INFO/CANCEL/RESUBMIT/AUTO_APPROVE).

## Invitations
PENDING → ACCEPTED|EXPIRED|REVOKED|DECLINED via CAS updates.

## Operations lifecycle
CAS `promoteLifecycleStatus` for status promotion (multi-instance safer than mutex alone).
