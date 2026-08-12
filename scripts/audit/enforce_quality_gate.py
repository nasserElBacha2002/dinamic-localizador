#!/usr/bin/env python3
"""Enforce audit quality gate — strict mode is fail-closed for framework integrity."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

AUDIT_SCRIPTS = Path(__file__).resolve().parent
if str(AUDIT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(AUDIT_SCRIPTS))

from framework.run_meta import findings_path, read_current_run  # noqa: E402
from framework.runner import validate_findings_payload  # noqa: E402

ENVIRONMENT_EXEMPT = {"environment_failure", "config_missing"}


def load_status() -> dict:
    path = Path(__file__).resolve().parents[2] / "audit" / "audit-status.json"
    if not path.exists():
        print(f"Quality gate: audit status not found at {path}", file=sys.stderr)
        return {
            "overall_status": "error",
            "max_severity": "critical",
            "blocking_status": "fail",
            "blocking_count": 1,
            "checks": [],
            "areas": {},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def is_blocking_check(check: dict) -> bool:
    if check.get("status") != "fail":
        return False
    if check.get("blocking") is not True:
        return False
    failure_type = check.get("failure_type", "unknown")
    return failure_type not in ENVIRONMENT_EXEMPT


def validate_framework_integrity(strict: bool) -> list[str]:
    """Return blocking reasons related to framework run integrity."""
    reasons: list[str] = []
    current = read_current_run()
    if current is None:
        reasons.append("framework: missing current-run.json (framework not started for this audit)")
        return reasons

    run_id = current.get("run_id")
    framework_status = current.get("framework_status")
    if framework_status == "error":
        reasons.append(
            f"framework: audit_framework_failure — {current.get('framework_message') or 'framework failed'}"
        )
        return reasons
    if framework_status == "pending" or current.get("completed") is not True:
        reasons.append("framework: incomplete — framework did not finish for this run")
        return reasons
    if framework_status != "ok":
        reasons.append(f"framework: unexpected framework_status={framework_status}")
        return reasons

    path = findings_path()
    if not path.exists():
        reasons.append("framework: findings.json missing for current run")
        return reasons
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        reasons.append(f"framework: findings.json corrupt ({exc})")
        return reasons

    errors = validate_findings_payload(payload, expected_run_id=str(run_id) if run_id else None)
    for err in errors:
        reasons.append(f"framework: {err}")

    if payload.get("run_type") != "full":
        reasons.append(f"framework: findings run_type must be full (got {payload.get('run_type')})")

    if not reasons and not payload.get("gate", {}).get("passed", True):
        for blocker in payload.get("gate", {}).get("blockers", []):
            reasons.append(
                f"framework:{blocker.get('id')}: {blocker.get('severity')}/{blocker.get('confidence')} — "
                f"{blocker.get('title')} ({blocker.get('file')})"
            )

    # In diagnostic mode, integrity failures are reported by caller as warnings when not strict
    _ = strict
    return reasons


def main() -> int:
    parser = argparse.ArgumentParser(description="Enforce audit quality gate")
    parser.add_argument("--strict", action="store_true", help="Exit 1 on blocking findings / framework integrity")
    parser.add_argument(
        "--no-framework",
        action="store_true",
        help="Ignore framework findings.json gate (not recommended)",
    )
    args = parser.parse_args()

    status = load_status()
    reasons: list[str] = []

    blocking_checks = [c for c in status.get("checks", []) if is_blocking_check(c)]
    if blocking_checks:
        for check in blocking_checks:
            reasons.append(
                f"{check.get('check')}: {check.get('failure_type')} ({check.get('severity')}) — "
                f"{check.get('root_cause', check.get('message'))}"
            )

    if status.get("blocking_status") == "fail" and not reasons:
        # Only treat as blocker when there is an explicit blocking check or framework issue
        if any(is_blocking_check(c) for c in status.get("checks", [])):
            reasons.append("blocking_status=fail")

    framework_reasons: list[str] = []
    if not args.no_framework:
        framework_reasons = validate_framework_integrity(strict=args.strict)
        if args.strict:
            reasons.extend(framework_reasons)
        elif framework_reasons:
            print("- framework integrity warnings (non-blocking in diagnostic):")
            for reason in framework_reasons:
                print(f"  - {reason}")

    # Also surface framework-deep-audit status failures marked blocking
    for check in status.get("checks", []):
        if check.get("check") == "framework-deep-audit" and check.get("failure_type") == "audit_framework_failure":
            msg = f"framework-deep-audit: {check.get('message')}"
            if args.strict and msg not in reasons:
                reasons.append(msg)

    env_checks = [c for c in status.get("checks", []) if c.get("failure_type") == "environment_failure"]
    if env_checks and args.strict:
        print("- environment warnings (non-blocking):")
        for check in env_checks:
            print(f"  - {check.get('check')}: validate locally")

    current = read_current_run() or {}
    print("Quality gate evaluation")
    print(f"- mode: {'strict (blocking / fail-closed)' if args.strict else 'diagnostic (informational)'}")
    print(f"- overall_status: {status.get('overall_status')}")
    print(f"- blocking_status: {status.get('blocking_status', 'unknown')}")
    print(f"- blocking_count: {status.get('blocking_count', 0)}")
    print(f"- max_severity: {status.get('max_severity')}")
    print(f"- run_id: {current.get('run_id', 'unknown')}")
    print(f"- framework_status: {current.get('framework_status', 'unknown')}")
    print(f"- framework_gate: {'enabled' if not args.no_framework else 'disabled'}")

    if reasons:
        print("- blocking reasons:")
        for reason in reasons:
            print(f"  - {reason}")
    else:
        print("- no blocking reasons detected")

    if args.strict and reasons:
        print("QUALITY GATE FAILED", file=sys.stderr)
        return 1

    print("Quality gate PASSED" if args.strict else "Diagnostic audit completed (non-blocking)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
