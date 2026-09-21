# 4B.3 — Audit methodology

```bash
rg -n -U --multiline-dotall 'catch\s*\([^)]*\)\s*\{.{0,300}?return\s+(\[\]|null|false)' backend/src --type ts

rg -n '\.catch\(\(error\)' backend/src/services/absence-request.service.ts

rg -n 'return \[\]|return null|return false' backend/src/services/absence*.ts | head -40
```

Corrected masking: absence detail affected-ops / balance impact.
