# 4B.2 — Audit methodology

```bash
rg -n 'catch' backend/src/services/whatsapp-usage-quota.service.ts \
  backend/src/services/bot-runtime-settings.service.ts \
  backend/src/services/geofence-policy.resolver.ts

rg -n 'findByCompanyId|defaultPolicy|fallback|DEFAULT' backend/src/services --type ts | head -80

rg -n 'catch\s*\([^)]*\)\s*\{' -U --multiline-dotall backend/src/services --type ts | head -60
```

Critical remediation: `whatsappUsageQuotaService.loadPolicy` no longer `catch → defaultPolicy(OFF)` on DB errors.
