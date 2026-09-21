# 4B.2 — Config loader inventory

| Loader | Semantics |
|---|---|
| geofencePolicyResolver | LOAD_ERROR → AppError (4A) |
| botRuntimeSettingsService | LOAD_ERROR → AppError (4A) |
| whatsappUsageQuotaService.resolvePolicy | configured / defaulted(not_configured) / error |

Silent critical fallback removed: quota `catch → OFF`.
