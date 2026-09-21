# Variant analysis (Phase 1B)

## VA-B1 — Unscoped `findById` then service company check
- Original: `userInvitationRepository.findById`
- Search: repository `WHERE id = @id` without company on tenant tables
- True positives: invitation (service-guarded)
- False positives: platform global lookups, job lease by id+owner

## VA-B2 — Client-trusted security decision fields
- Original: `createAttendanceSchema` validationStatus
- Variants: manual schemas omit statuses (OK); review schema APPROVE/REJECT only (OK)

## VA-B3 — Geofence margin sources
- Original: bot-runtime env-only
- Variants: company-operational-defaults (correct), geolocation.service env-only, bot-simulator env

## VA-B4 — Process-local concurrency controls
- Original: rate-limit Map; job `isRunning`
- Variants: listed in Phase 1A VA-01/VA-04
