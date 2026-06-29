#!/usr/bin/env python3
"""Aggregate audit/raw artifacts into audit-summary.md and audit-status.json."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

SEVERITY_ORDER = ["none", "info", "low", "medium", "high", "critical"]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def audit_raw() -> Path:
    return repo_root() / "audit" / "raw"


def audit_dir() -> Path:
    return repo_root() / "audit"


def load_status_files(meta_dir: Path) -> list[dict]:
    checks: list[dict] = []
    if not meta_dir.exists():
        return checks
    for path in sorted(meta_dir.glob("*.status.json")):
        try:
            checks.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            checks.append(
                {
                    "check": path.stem.replace(".status", ""),
                    "status": "error",
                    "severity": "medium",
                    "message": "Invalid status JSON",
                }
            )
    return checks


def parse_output_status(path: Path) -> str | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"^STATUS:\s*(\w+)", text, re.MULTILINE)
    return match.group(1).upper() if match else None


def npm_audit_severity(path: Path) -> str:
    if not path.exists():
        return "none"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return "medium"
    metadata = data.get("metadata", {}).get("vulnerabilities", {})
    if metadata.get("critical", 0) > 0:
        return "critical"
    if metadata.get("high", 0) > 0:
        return "high"
    if metadata.get("moderate", 0) > 0:
        return "medium"
    if metadata.get("low", 0) > 0:
        return "low"
    return "none"


def max_severity(*values: str) -> str:
    best = "none"
    for value in values:
        if value not in SEVERITY_ORDER:
            continue
        if SEVERITY_ORDER.index(value) > SEVERITY_ORDER.index(best):
            best = value
    return best


def area_for_check(name: str) -> str:
    if name.startswith("frontend-") and "architecture" not in name and "circular" not in name:
        return "frontend"
    if name.startswith("backend-") and "architecture" not in name and "domain" not in name and "circular" not in name:
        return "backend"
    if "frontend" in name:
        return "frontend_architecture"
    if "backend-domain" in name:
        return "domain_rules"
    if "backend" in name:
        return "backend_architecture"
    if name.startswith("security"):
        return "security"
    return "other"


def build_area_summary(checks: list[dict], raw: Path) -> dict:
    areas: dict[str, dict] = {
        "frontend": {"status": "ok", "max_severity": "none", "checks": []},
        "backend": {"status": "ok", "max_severity": "none", "checks": []},
        "frontend_architecture": {"status": "ok", "max_severity": "none", "checks": []},
        "backend_architecture": {"status": "ok", "max_severity": "none", "checks": []},
        "security": {"status": "ok", "max_severity": "none", "checks": []},
        "domain_rules": {"status": "ok", "max_severity": "none", "checks": []},
    }

    for check in checks:
        area = area_for_check(check.get("check", ""))
        if area not in areas:
            continue
        areas[area]["checks"].append(check)
        areas[area]["max_severity"] = max_severity(areas[area]["max_severity"], check.get("severity", "none"))
        if check.get("status") in {"fail", "error"}:
            areas[area]["status"] = "findings"

    for audit_file, area, sev in [
        ("frontend-npm-audit.json", "frontend", npm_audit_severity(raw / "frontend-npm-audit.json")),
        ("backend-npm-audit.json", "backend", npm_audit_severity(raw / "backend-npm-audit.json")),
    ]:
        if (raw / audit_file).exists():
            areas[area]["max_severity"] = max_severity(areas[area]["max_severity"], sev)
            if sev in {"high", "critical"}:
                areas[area]["status"] = "findings"

    secrets = raw / "security-secrets-audit.md"
    if secrets.exists() and "potential hardcoded secrets" in secrets.read_text(encoding="utf-8", errors="replace"):
        areas["security"]["status"] = "findings"
        areas["security"]["max_severity"] = max_severity(areas["security"]["max_severity"], "critical")

    return areas


def overall_status(areas: dict, checks: list[dict]) -> tuple[str, str]:
    severities = [check.get("severity", "none") for check in checks]
    for area in areas.values():
        severities.append(area.get("max_severity", "none"))

    max_sev = max_severity(*severities) if severities else "none"
    if any(check.get("status") == "error" for check in checks):
        return "error", max_sev
    if max_sev in {"high", "critical"} or any(check.get("status") == "fail" for check in checks):
        return "findings", max_sev
    return "ok", max_sev


def list_artifacts(raw: Path) -> list[str]:
    artifacts: list[str] = []
    for path in sorted(raw.rglob("*")):
        if path.is_file() and path.name != "LATEST_RUN.txt":
            rel = path.relative_to(repo_root())
            if "_meta" in rel.parts or "runs" in rel.parts:
                continue
            artifacts.append(str(rel))
    return artifacts


def render_markdown(status: dict, artifacts: list[str]) -> str:
    lines = [
        "# Code Audit Summary",
        "",
        f"Generated at: {status['generated_at']}",
        f"Overall status: **{status['overall_status']}**",
        f"Max severity: **{status['max_severity']}**",
        "",
        "## Areas",
        "",
        "| Area | Status | Max severity | Checks |",
        "|------|--------|--------------|--------|",
    ]

    for area, data in status["areas"].items():
        lines.append(
            f"| {area} | {data.get('status', 'n/a')} | {data.get('max_severity', 'none')} | {len(data.get('checks', []))} |"
        )

    lines.extend(["", "## Checks", "", "| Check | Status | Severity | Message |", "|-------|--------|----------|---------|"])
    for check in status.get("checks", []):
        lines.append(
            f"| {check.get('check', '')} | {check.get('status', '')} | {check.get('severity', '')} | {check.get('message', '').replace('|', '/')} |"
        )

    critical = [c for c in status.get("checks", []) if c.get("severity") == "critical" or c.get("status") == "fail"]
    lines.extend(["", "## Critical highlights", ""])
    if critical:
        for check in critical[:20]:
            lines.append(f"- **{check.get('check')}**: {check.get('message')}")
    else:
        lines.append("- No critical automated checks failed.")

    lines.extend(
        [
            "",
            "## Recommendations",
            "",
            "1. Fix failing lint/typecheck/test/build checks first.",
            "2. Address high/critical npm audit findings.",
            "3. Review architecture/domain heuristic reports for medium-priority refactors.",
            "4. Re-run with `npm run audit:strict` before enforcing CI quality gate.",
            "",
            "## Evidence files",
            "",
        ]
    )
    for artifact in artifacts:
        lines.append(f"- `{artifact}`")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    raw = audit_raw()
    meta = raw / "_meta"
    checks = load_status_files(meta)

    # Enrich from raw outputs when meta is missing
    for name, file_name, default_sev in [
        ("frontend-eslint", "frontend-eslint.txt", "medium"),
        ("frontend-typecheck", "frontend-typecheck.txt", "high"),
        ("frontend-test", "frontend-test.txt", "critical"),
        ("frontend-build", "frontend-build.txt", "critical"),
        ("backend-eslint", "backend-eslint.txt", "medium"),
        ("backend-typecheck", "backend-typecheck.txt", "high"),
        ("backend-test", "backend-test.txt", "critical"),
        ("backend-build", "backend-build.txt", "critical"),
    ]:
        if any(c.get("check") == name for c in checks):
            continue
        status = parse_output_status(raw / file_name)
        if status is None:
            checks.append({"check": name, "status": "not_run", "severity": "info", "message": "NOT_RUN"})
        elif status == "SKIPPED":
            checks.append({"check": name, "status": "skipped", "severity": "info", "message": "SKIPPED"})
        elif status == "FAIL":
            checks.append({"check": name, "status": "fail", "severity": default_sev, "message": "Failed"})
        else:
            checks.append({"check": name, "status": "pass", "severity": "none", "message": "Passed"})

    areas = build_area_summary(checks, raw)
    overall, max_sev = overall_status(areas, checks)

    status = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "overall_status": overall,
        "max_severity": max_sev,
        "areas": areas,
        "checks": checks,
        "artifacts": list_artifacts(raw),
    }

    out_dir = audit_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "audit-status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    (out_dir / "audit-summary.md").write_text(render_markdown(status, status["artifacts"]), encoding="utf-8")
    print(f"Wrote {out_dir / 'audit-summary.md'}")
    print(f"Wrote {out_dir / 'audit-status.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
