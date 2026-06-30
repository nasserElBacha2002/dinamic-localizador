#!/usr/bin/env python3
"""Aggregate audit/raw artifacts into audit-summary.md and audit-status.json."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from check_enrichment import compute_blocking_status, enrich_check, SEVERITY_ORDER

# Re-export max_severity from enrichment - need to add it to check_enrichment or define here
def max_severity(*values: str) -> str:
    best = "none"
    for value in values:
        if value not in SEVERITY_ORDER:
            continue
        if SEVERITY_ORDER.index(value) > SEVERITY_ORDER.index(best):
            best = value
    return best


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


def area_for_check(name: str) -> str:
    if name.startswith("frontend-") and "architecture" not in name and "circular" not in name and "duplication" not in name and "dead-code" not in name:
        return "frontend"
    if name.startswith("backend-") and "architecture" not in name and "domain" not in name and "circular" not in name and "duplication" not in name and "dead-code" not in name:
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


def build_area_summary(checks: list[dict]) -> dict:
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
        sev = check.get("severity", "none")
        if check.get("failure_type") == "environment_failure" and sev == "critical":
            sev = "high"
        areas[area]["max_severity"] = max_severity(areas[area]["max_severity"], sev)
        if check.get("status") in {"fail", "error"} and check.get("failure_type") != "environment_failure":
            areas[area]["status"] = "findings"
        elif check.get("status") in {"fail", "error"} and areas[area]["status"] == "ok":
            areas[area]["status"] = "findings"
        elif check.get("status") == "pass" and check.get("severity") == "info":
            pass  # informational pass does not mark area as findings

    return areas


def effective_max_severity(checks: list[dict], areas: dict) -> str:
    severities = []
    for check in checks:
        if check.get("failure_type") == "environment_failure":
            continue
        severities.append(check.get("severity", "none"))
    for area in areas.values():
        severities.append(area.get("max_severity", "none"))
    return max_severity(*severities) if severities else "none"


def overall_status(areas: dict, checks: list[dict]) -> tuple[str, str]:
    max_sev = effective_max_severity(checks, areas)
    blocking_fails = [
        c
        for c in checks
        if c.get("status") == "fail" and c.get("failure_type") not in {"environment_failure", "unknown"}
        and c.get("blocking", c.get("failure_type") in {"test_failure", "security_issue"})
    ]
    env_fails = [c for c in checks if c.get("failure_type") == "environment_failure"]
    if any(c.get("status") == "error" for c in checks):
        return "error", max_sev
    if blocking_fails or max_sev in {"high", "critical"}:
        return "findings", max_sev
    if env_fails:
        return "findings", max_severity(max_sev, "high")
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


def compare_baseline(current_checks: list[dict], baseline_path: Path) -> dict | None:
    if not baseline_path.exists():
        return None
    try:
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    def key(c: dict) -> str:
        return c.get("check", "")

    def is_finding(c: dict) -> bool:
        return c.get("status") in {"fail", "error", "skipped"} and c.get("failure_type") not in {"unknown"}

    current_map = {key(c): c for c in current_checks}
    baseline_map = {key(c): c for c in baseline.get("checks", [])}

    new_findings = []
    resolved = []
    persistent = []

    for name, cur in current_map.items():
        if not is_finding(cur):
            continue
        base = baseline_map.get(name)
        if not base or not is_finding(base):
            new_findings.append(cur)
        elif base.get("status") == "fail" and cur.get("status") == "fail":
            persistent.append(cur)

    for name, base in baseline_map.items():
        if not is_finding(base):
            continue
        cur = current_map.get(name)
        if cur and cur.get("status") == "pass":
            resolved.append(base)

    return {
        "baseline_generated_at": baseline.get("generated_at"),
        "current_max_severity": effective_max_severity(current_checks, {}),
        "baseline_max_severity": baseline.get("max_severity", "none"),
        "new_findings": new_findings,
        "resolved_findings": resolved,
        "persistent_findings": persistent,
    }


def render_baseline_diff(diff: dict | None) -> list[str]:
    if not diff:
        return [
            "",
            "## Baseline comparison",
            "",
            "_No baseline found. Run `npm run audit:baseline` after confirming a good state._",
            "",
        ]
    lines = [
        "",
        "## Baseline comparison",
        "",
        f"- Baseline from: {diff.get('baseline_generated_at', 'unknown')}",
        f"- Baseline max severity: **{diff.get('baseline_max_severity')}**",
        f"- Current max severity: **{diff.get('current_max_severity')}**",
        "",
    ]
    for title, items in [
        ("New findings", diff.get("new_findings", [])),
        ("Resolved since baseline", diff.get("resolved_findings", [])),
        ("Persistent findings", diff.get("persistent_findings", [])),
    ]:
        lines.append(f"### {title}")
        if not items:
            lines.append("- None")
        else:
            for item in items:
                lines.append(
                    f"- **{item.get('check')}** ({item.get('severity')}, {item.get('failure_type')}): {item.get('root_cause', item.get('message'))}"
                )
        lines.append("")
    return lines


def executive_summary(status: dict) -> list[str]:
    areas = status.get("areas", {})
    passed = [a for a, d in areas.items() if d.get("status") == "ok"]
    findings = [a for a, d in areas.items() if d.get("status") == "findings"]
    env_checks = [c for c in status.get("checks", []) if c.get("failure_type") == "environment_failure"]
    blocking = [c for c in status.get("checks", []) if c.get("blocking") and c.get("status") == "fail"]
    informative_findings = [
        c
        for c in status.get("checks", [])
        if c.get("status") == "fail" and not c.get("blocking")
    ]

    priority = "low"
    if status.get("blocking_status") == "fail":
        priority = "critical — blocking checks require action before merge/deploy"
    elif any(c.get("severity") == "critical" and c.get("blocking") for c in status.get("checks", [])):
        priority = "critical — address blocking code/security issues"
    elif status.get("max_severity") in {"high", "critical"}:
        priority = "high — dependencies or unconfirmed test failures"
    elif findings:
        priority = "medium — architecture or non-blocking findings"

    categories = []
    for c in status.get("checks", []):
        if c.get("status") != "fail":
            continue
        ft = c.get("failure_type", "unknown")
        if ft not in categories:
            categories.append(ft)

    lines = [
        "## Executive summary",
        "",
        f"- Areas passing: {', '.join(passed) if passed else 'none'}",
        f"- Areas with findings: {', '.join(findings) if findings else 'none'}",
        f"- Real priority: **{priority}**",
        f"- Blocking status: **{status.get('blocking_status', 'unknown')}** ({status.get('blocking_count', 0)} blocking check(s))",
        f"- Informative (non-blocking) findings: {len(informative_findings)}",
        f"- Failure categories detected: {', '.join(categories) if categories else 'none'}",
        f"- Environment-dependent checks: {len(env_checks)}",
        "",
    ]
    return lines


def root_causes_section(checks: list[dict]) -> list[str]:
    lines = ["## Root causes", ""]
    relevant = [
        c
        for c in checks
        if c.get("status") in {"fail", "skipped", "not_installed", "error"} or c.get("failure_type") not in {"unknown", None}
    ]
    if not relevant:
        lines.append("No failed or skipped checks requiring attention.")
        lines.append("")
        return lines

    for check in relevant:
        if check.get("status") == "pass":
            continue
        evidence = check.get("evidence_files") or ([check.get("evidence_file")] if check.get("evidence_file") else [])
        evidence_str = ", ".join(f"`{e}`" for e in evidence) if evidence else "n/a"
        lines.extend(
            [
                f"### {check.get('check')}",
                f"- Status: {check.get('status')}",
                f"- Severity: {check.get('severity')}",
                f"- Failure type: {check.get('failure_type')}",
                f"- Root cause: {check.get('root_cause', check.get('message'))}",
                f"- Evidence: {evidence_str}",
                f"- Suggested action: {check.get('action_hint')}",
                "",
            ]
        )
    return lines


def next_actions_section(checks: list[dict]) -> list[str]:
    actions: list[tuple[int, str]] = []
    for check in checks:
        if check.get("status") not in {"fail", "skipped"}:
            continue
        ft = check.get("failure_type")
        hint = check.get("action_hint", "")
        name = check.get("check")
        if ft == "test_failure" and check.get("blocking"):
            actions.append((1, f"Fix real test failures in **{name}**."))
        elif ft == "environment_failure":
            actions.append((2, f"Confirm **{name}** outside sandbox/CI before treating as defect."))
        elif ft == "dependency_vulnerability":
            actions.append((3, f"Review npm audit for **{name}**; apply safe fixes only."))
        elif ft == "architecture_issue":
            actions.append((4, f"Resolve architecture finding in **{name}**."))
        elif ft == "config_missing":
            actions.append((5, f"Configure or document skipped check **{name}**."))
        elif ft == "security_issue":
            actions.append((0, f"URGENT: resolve **{name}** immediately."))
        elif check.get("blocking"):
            actions.append((1, hint or f"Investigate **{name}**."))

    actions.sort(key=lambda x: x[0])
    lines = ["## Next actions", ""]
    if not actions:
        lines.append("1. No immediate actions — baseline looks healthy.")
    else:
        seen = set()
        idx = 1
        for _, text in actions:
            if text in seen:
                continue
            seen.add(text)
            lines.append(f"{idx}. {text}")
            idx += 1
    lines.append("")
    return lines


def environment_notes(checks: list[dict]) -> list[str]:
    env = [c for c in checks if c.get("failure_type") == "environment_failure"]
    if not env:
        return []
    lines = [
        "## Environment notes",
        "",
        "Some checks appear to be environment-dependent. Validate them locally or in CI before treating them as blocking defects.",
        "",
    ]
    for check in env:
        lines.append(f"- **{check.get('check')}**: {check.get('root_cause')}")
    lines.append("")
    return lines


def npm_audit_section(checks: list[dict]) -> list[str]:
    lines = ["## Dependency vulnerabilities", ""]
    any_vuln = False
    for check in checks:
        if not check.get("check", "").endswith("-npm-audit"):
            continue
        info = check.get("npm_audit") or {}
        if not info.get("available"):
            continue
        counts = info.get("counts", {})
        if not sum(counts.values()):
            continue
        any_vuln = True
        lines.append(f"### {check.get('check')}")
        lines.append(
            f"- Counts: critical={counts.get('critical', 0)}, high={counts.get('high', 0)}, "
            f"moderate={counts.get('moderate', 0)}, low={counts.get('low', 0)}"
        )
        for pkg in info.get("packages", [])[:5]:
            fix = "fix available" if pkg.get("fix_available") else "no automatic fix"
            if pkg.get("fix_is_major"):
                fix += " (major bump — review manually)"
            lines.append(f"- `{pkg.get('name')}` [{pkg.get('severity')}]: {pkg.get('title', '')[:80]} ({fix})")
        lines.append(f"- Recommendation: {info.get('recommendation')}")
        lines.append("")
    if not any_vuln:
        lines.append("No npm audit vulnerabilities reported in captured JSON.")
        lines.append("")
    return lines


def render_markdown(status: dict, artifacts: list[str], diff: dict | None) -> str:
    lines = [
        "# Code Audit Summary",
        "",
        f"Generated at: {status['generated_at']}",
        f"Mode: **diagnostic** (`npm run audit` — non-blocking)",
        f"Overall status: **{status['overall_status']}**",
        f"Blocking status: **{status.get('blocking_status', 'unknown')}**",
        f"Max severity (excluding environment-only): **{status['max_severity']}**",
        "",
    ]
    lines.extend(executive_summary(status))
    lines.extend(
        [
            "## Areas",
            "",
            "| Area | Status | Max severity | Checks |",
            "|------|--------|--------------|--------|",
        ]
    )
    for area, data in status["areas"].items():
        lines.append(
            f"| {area} | {data.get('status', 'n/a')} | {data.get('max_severity', 'none')} | {len(data.get('checks', []))} |"
        )

    lines.extend(
        [
            "",
            "## Checks",
            "",
            "| Check | Status | Severity | Failure type | Message |",
            "|-------|--------|----------|--------------|---------|",
        ]
    )
    for check in status.get("checks", []):
        lines.append(
            f"| {check.get('check', '')} | {check.get('status', '')} | {check.get('severity', '')} | "
            f"{check.get('failure_type', '')} | {str(check.get('message', '')).replace('|', '/')} |"
        )

    lines.extend(root_causes_section(status.get("checks", [])))
    lines.extend(next_actions_section(status.get("checks", [])))
    lines.extend(environment_notes(status.get("checks", [])))
    lines.extend(npm_audit_section(status.get("checks", [])))
    lines.extend(render_baseline_diff(diff))
    lines.extend(["## Evidence files", ""])
    for artifact in artifacts:
        lines.append(f"- `{artifact}`")
    lines.append("")
    return "\n".join(lines)


def render_baseline_diff_md(diff: dict | None) -> str:
    if not diff:
        return "\n".join(
            [
                "# Audit Baseline Comparison",
                "",
                "No baseline found.",
                "",
                "Run `npm run audit:baseline` after confirming an acceptable audit state.",
                "",
            ]
        )
    return "\n".join(render_baseline_diff(diff))


def main() -> int:
    root = repo_root()
    raw = audit_raw()
    meta = raw / "_meta"
    checks = load_status_files(meta)

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
        out_status = parse_output_status(raw / file_name)
        if out_status is None:
            checks.append({"check": name, "status": "not_run", "severity": "info", "message": "NOT_RUN"})
        elif out_status == "SKIPPED":
            checks.append({"check": name, "status": "skipped", "severity": "info", "message": "SKIPPED"})
        elif out_status == "FAIL":
            checks.append({"check": name, "status": "fail", "severity": default_sev, "message": "Failed"})
        else:
            checks.append({"check": name, "status": "pass", "severity": "none", "message": "Passed"})

    checks = [enrich_check(c, root) for c in checks]
    areas = build_area_summary(checks)
    overall, max_sev = overall_status(areas, checks)
    blocking_status, blocking_count = compute_blocking_status(checks)

    baseline_path = audit_dir() / "baseline" / "audit-status.baseline.json"
    diff = compare_baseline(checks, baseline_path)

    status = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "mode": "diagnostic",
        "overall_status": overall,
        "max_severity": max_sev,
        "blocking_status": blocking_status,
        "blocking_count": blocking_count,
        "areas": areas,
        "checks": checks,
        "artifacts": list_artifacts(raw),
        "baseline_comparison": diff,
    }

    out_dir = audit_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "audit-status.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    (out_dir / "audit-summary.md").write_text(render_markdown(status, status["artifacts"], diff), encoding="utf-8")
    (out_dir / "audit-diff.md").write_text(render_baseline_diff_md(diff), encoding="utf-8")
    print(f"Wrote {out_dir / 'audit-summary.md'}")
    print(f"Wrote {out_dir / 'audit-status.json'}")
    print(f"Wrote {out_dir / 'audit-diff.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
