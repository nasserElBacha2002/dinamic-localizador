#!/usr/bin/env python3
"""Enforce audit quality gate — strict mode blocks only on confirmed critical issues."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

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


def main() -> int:
    parser = argparse.ArgumentParser(description="Enforce audit quality gate")
    parser.add_argument("--strict", action="store_true", help="Exit 1 on blocking findings")
    args = parser.parse_args()

    status = load_status()
    reasons: list[str] = []

    blocking_checks = [c for c in status.get("checks", []) if is_blocking_check(c)]
    if blocking_checks:
        for check in blocking_checks:
            reasons.append(
                f"{check.get('check')}: {check.get('failure_type')} ({check.get('severity')}) — {check.get('root_cause', check.get('message'))}"
            )

    if status.get("blocking_status") == "fail" and not reasons:
        reasons.append("blocking_status=fail")

    env_checks = [c for c in status.get("checks", []) if c.get("failure_type") == "environment_failure"]
    if env_checks and args.strict:
        print("- environment warnings (non-blocking):")
        for check in env_checks:
            print(f"  - {check.get('check')}: validate locally")

    print("Quality gate evaluation")
    print(f"- mode: {'strict (blocking)' if args.strict else 'diagnostic (informational)'}")
    print(f"- overall_status: {status.get('overall_status')}")
    print(f"- blocking_status: {status.get('blocking_status', 'unknown')}")
    print(f"- blocking_count: {status.get('blocking_count', 0)}")
    print(f"- max_severity: {status.get('max_severity')}")

    if reasons:
        print("- blocking reasons:")
        for reason in reasons:
            print(f"  - {reason}")
    else:
        print("- no blocking reasons detected")

    if args.strict and reasons:
        print("Quality gate FAILED", file=sys.stderr)
        return 1

    print("Quality gate PASSED" if args.strict else "Diagnostic audit completed (non-blocking)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
