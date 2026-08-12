#!/usr/bin/env python3
"""Save current audit status + normalized findings as confirmed baseline.

Only accepts a completed FULL framework audit with matching run metadata.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

AUDIT_SCRIPTS = Path(__file__).resolve().parent
if str(AUDIT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(AUDIT_SCRIPTS))

from framework.io import atomic_write_json  # noqa: E402
from framework.run_meta import findings_path, read_current_run  # noqa: E402
from framework.runner import validate_findings_payload  # noqa: E402


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    current_status = root / "audit" / "audit-status.json"
    findings = findings_path()
    baseline_dir = root / "audit" / "baseline"
    baseline = baseline_dir / "audit-status.baseline.json"
    findings_baseline = baseline_dir / "findings.baseline.json"

    current = read_current_run()
    if current is None:
        print("Baseline NOT saved: missing current-run.json. Run `npm run audit` first.", file=sys.stderr)
        return 1
    if current.get("framework_status") != "ok" or current.get("completed") is not True:
        print(
            f"Baseline NOT saved: framework incomplete (status={current.get('framework_status')}).",
            file=sys.stderr,
        )
        return 1
    if not findings.exists():
        print("Baseline NOT saved: findings.json missing.", file=sys.stderr)
        return 1

    try:
        payload = json.loads(findings.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Baseline NOT saved: findings.json corrupt ({exc}).", file=sys.stderr)
        return 1

    errors = validate_findings_payload(payload, expected_run_id=str(current.get("run_id")))
    if payload.get("run_type") != "full":
        errors.append(f"run_type must be full (got {payload.get('run_type')})")
    if not payload.get("gate") or "passed" not in payload["gate"]:
        errors.append("gate not evaluated")
    if errors:
        print("Baseline NOT saved:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    baseline_dir.mkdir(parents=True, exist_ok=True)

    if current_status.exists():
        atomic_write_json(baseline, json.loads(current_status.read_text(encoding="utf-8")))
        print(f"Baseline saved to {baseline}")
    else:
        print("Warning: audit-status.json missing; saving findings baseline only.")

    slim = {
        "run_id": payload.get("run_id"),
        "generated_at": payload.get("generated_at"),
        "run_type": payload.get("run_type"),
        "completed": True,
        "finding_count": payload.get("finding_count"),
        "findings": payload.get("findings", []),
        "gate": payload.get("gate"),
    }
    atomic_write_json(findings_baseline, slim)
    print(f"Findings baseline saved to {findings_baseline}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
