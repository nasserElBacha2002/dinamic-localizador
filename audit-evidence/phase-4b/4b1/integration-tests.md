# 4B.1 — Integration tests

```bash
RUN_DB_INTEGRATION_TESTS=true npx tsx --test \
  src/services/job-distributed-lock.integration.test.ts \
  src/services/whatsapp-retention-lock.integration.test.ts
```

Cases: simultaneous acquisition, crash recovery (connection close), resource isolation, retention lock regression.
