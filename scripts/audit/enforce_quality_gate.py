#!/usr/bin/env python3
"""Enforce audit quality gate (non-blocking by default, strict mode for CI/local enforcement)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_status() -> dict:
    path = Path(__file__).resolve().parents[2] / "audit" / "audit-status.json"
    if not path.exists():
        print(f"Quality gate: audit status not found at {path}", file=sys.stderr)
        return {
            "overall_status": "error",
            "max_severity": "critical",
            "checks": [],
            "areas": {},
        }
    return json.loads(path.read_text(encoding="utf-8"))


def has_failed_check(status: dict, names: tuple[str, ...]) -> bool:
    for check in status.get("checks", []):
        if check.get("check") in names and check.get("status") == "fail":
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Enforce audit quality gate")
    parser.add_argument("--strict", action="store_true", help="Exit 1 on critical findings")
    args = parser.parse_args()

    status = load_status()
    reasons: list[str] = []

    if status.get("overall_status") == "error":
        reasons.append("overall_status=error")

    if status.get("max_severity") == "critical":
        reasons.append("max_severity=critical")

    critical_checks = (
        "frontend-test",
        "backend-test",
        "frontend-build",
        "backend-build",
    )
    if has_failed_check(status, critical_checks):
        reasons.append("tests_or_build_failed")

    if has_failed_check(status, ("frontend-typecheck", "backend-typecheck")):
        reasons.append("typecheck_failed")

    if has_failed_check(status, ("security-secrets",)):
        reasons.append("hardcoded_secrets_detected")

    for area_name, area in status.get("areas", {}).items():
        if area.get("max_severity") == "critical":
            reasons.append(f"area_{area_name}_critical")

    print("Quality gate evaluation")
    print(f"- overall_status: {status.get('overall_status')}")
    print(f"- max_severity: {status.get('max_severity')}")
    print(f"- strict mode: {args.strict}")

    if reasons:
        print("- blocking reasons:")
        for reason in reasons:
            print(f"  - {reason}")
    else:
        print("- no blocking reasons detected")

    if args.strict and reasons:
        print("Quality gate FAILED", file=sys.stderr)
        return 1

    print("Quality gate PASSED (or non-strict mode)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
