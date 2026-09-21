# SSRF review

| Outbound | Control | Status |
|----------|---------|--------|
| Twilio media `fetch(mediaUrl)` | Host allowlist, HTTPS, DNS private-IP block, no redirects | CONFIRMED_SAFE |
| Google geocode | Fixed `maps.googleapis.com`; address as query | CONFIRMED_SAFE |
| Twilio SDK API | Fixed Twilio endpoints | NOT_APPLICABLE |
| User-controlled free-form URL fetch | Not found | NOT_APPLICABLE |

Residual DNS rebinding after pre-check: UNVERIFIED residual, not confirmed defect.
