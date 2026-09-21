# Dead code / config

- `dead_env` scanner: 3 hits — treat unused documented env as suspected FP (compose/shell).
- No systematic unused-export pass (TS dynamic imports / Express routers register all).
- LOC-P1-013: missing `security-audit.yaml` is readiness gap, not dead code.
