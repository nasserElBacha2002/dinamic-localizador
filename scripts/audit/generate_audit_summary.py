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


AUDIT_VERSION = "3.0"


def parse_sql_classification(raw: Path) -> dict[str, int]:
    json_path = raw / "backend-sql-analysis.json"
    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            classification = data.get("sql_classification", {})
            if classification:
                return {
                    "allowed_operational_sql": int(classification.get("allowed_operational_sql", 0)),
                    "allowed_healthcheck_sql": int(classification.get("allowed_healthcheck_sql", 0)),
                    "repository_sql": int(classification.get("repository_sql", 0)),
                    "warning_sql_outside_repository": int(
                        classification.get("warning_sql_outside_repository", 0)
                    ),
                }
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    path = raw / "backend-architecture-audit.md"
    counts = {
        "allowed_operational_sql": 0,
        "allowed_healthcheck_sql": 0,
        "repository_sql": 0,
        "warning_sql_outside_repository": 0,
    }
    if not path.exists():
        return counts
    text = path.read_text(encoding="utf-8", errors="replace")
    for key, title_fragment in [
        ("allowed_operational_sql", "Allowed operational SQL"),
        ("allowed_healthcheck_sql", "Allowed healthcheck SQL"),
        ("repository_sql", "Repository SQL"),
        ("warning_sql_outside_repository", "SQL outside repositories"),
    ]:
        match = re.search(rf"### {re.escape(title_fragment)}[^—]*— (\d+) occurrence", text)
        if match:
            counts[key] = int(match.group(1))
    summary = re.search(r"warning_sql_outside_repository = \*\*(\d+)\*\*", text)
    if summary:
        counts["warning_sql_outside_repository"] = int(summary.group(1))
    return counts


def parse_domain_sql(raw: Path) -> dict[str, int | str]:
    json_path = raw / "backend-sql-analysis.json"
    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            param = data.get("parameterized_sql", {})
            if param:
                return {
                    "input_files": int(param.get("input_files", 0)),
                    "input_count": int(param.get("input_count", 0)),
                    "query_files": int(param.get("query_files", 0)),
                    "risky_count": int(param.get("risky_count", 0)),
                }
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    path = raw / "backend-domain-rules-audit.md"
    result: dict[str, int | str] = {
        "input_files": 0,
        "input_count": 0,
        "query_files": 0,
        "risky_count": 0,
    }
    if not path.exists():
        return result
    text = path.read_text(encoding="utf-8", errors="replace")
    for key, pattern in [
        ("input_files", r"Files with .*input.* bindings:\s*\*\*(\d+)\*\*"),
        ("input_count", r"Parameter binding occurrences:\s*\*\*(\d+)\*\*"),
        ("query_files", r"Files executing SQL.*:\s*\*\*(\d+)\*\*"),
        ("risky_count", r"Potential risky dynamic SQL:\s*\*\*(\d+)\*\*"),
    ]:
        match = re.search(pattern, text)
        if match:
            result[key] = int(match.group(1))
    return result


def parse_security_env(raw: Path) -> dict:
    path = raw / "security-env-audit.md"
    result = {
        "used_not_documented": [],
        "documented_not_used": [],
        "missing_count": 0,
    }
    if not path.exists():
        return result
    text = path.read_text(encoding="utf-8", errors="replace")
    for section_key, field in [
        ("used_but_not_documented", "used_not_documented"),
        ("documented_but_not_used", "documented_not_used"),
    ]:
        section = re.search(rf"## {section_key}[^\n]*\n(.*?)(?:\n## |\Z)", text, re.S)
        if section:
            result[field] = [
                line.strip()[2:]
                for line in section.group(1).splitlines()
                if line.strip().startswith("- ") and line.strip() != "- None"
            ]
    result["missing_count"] = len(result["used_not_documented"])
    return result


def parse_security_secrets(raw: Path) -> dict:
    path = raw / "security-secrets-audit.md"
    result = {"findings_count": 0, "has_findings": False}
    if not path.exists():
        return result
    text = path.read_text(encoding="utf-8", errors="replace")
    if "Potential hardcoded secrets detected" in text:
        result["has_findings"] = True
        match = re.search(r"Total findings:\s*\*\*(\d+)\*\*", text)
        if match:
            result["findings_count"] = int(match.group(1))
    return result


def build_accepted_exceptions(sql_class: dict[str, int]) -> list[dict]:
    exceptions: list[dict] = []
    labels = {
        "allowed_operational_sql": "SQL in scripts, migrations, and store utilities",
        "allowed_healthcheck_sql": "Healthcheck SELECT 1 in health.controller.ts",
        "repository_sql": "SQL inside repository layer (expected)",
    }
    for key, description in labels.items():
        count = sql_class.get(key, 0)
        if count > 0:
            exceptions.append(
                {
                    "category": key,
                    "count": count,
                    "description": description,
                    "severity": "info",
                }
            )
    return exceptions


def build_non_blocking_findings(checks: list[dict], env_info: dict, sql_class: dict) -> list[dict]:
    findings: list[dict] = []
    for check in checks:
        if check.get("status") == "fail" and not check.get("blocking"):
            findings.append(
                {
                    "check": check.get("check"),
                    "severity": check.get("severity"),
                    "failure_type": check.get("failure_type"),
                    "message": check.get("root_cause", check.get("message")),
                }
            )
        elif check.get("failure_type") == "environment_failure":
            findings.append(
                {
                    "check": check.get("check"),
                    "severity": check.get("severity"),
                    "failure_type": "environment_failure",
                    "message": check.get("root_cause", check.get("message")),
                }
            )
    warn_count = sql_class.get("warning_sql_outside_repository", 0)
    if warn_count > 0:
        findings.append(
            {
                "check": "backend-architecture",
                "severity": "medium",
                "failure_type": "architecture_issue",
                "message": f"SQL outside repositories: {warn_count} occurrence(s) to review",
            }
        )
    if env_info.get("missing_count", 0) > 0:
        findings.append(
            {
                "check": "security-env",
                "severity": "medium",
                "failure_type": "config_missing",
                "message": f"Undocumented env vars: {', '.join(env_info.get('used_not_documented', [])[:6])}",
            }
        )
    return findings


def blocking_checks_section(checks: list[dict]) -> list[str]:
    blocking = [c for c in checks if c.get("blocking") and c.get("status") == "fail"]
    lines = ["## Blocking checks", ""]
    if not blocking:
        lines.append("No blocking failures detected.")
    else:
        for check in blocking:
            lines.append(
                f"- **{check.get('check')}** ({check.get('severity')}): "
                f"{check.get('root_cause', check.get('message'))}"
            )
    lines.append("")
    return lines


def non_blocking_section(checks: list[dict], non_blocking: list[dict]) -> list[str]:
    lines = ["## Non-blocking findings", ""]
    seen = set()
    items = non_blocking or [
        c
        for c in checks
        if c.get("status") == "fail" and not c.get("blocking")
    ]
    if not items:
        lines.append("No non-blocking warnings.")
    else:
        for item in items:
            key = (item.get("check"), item.get("message"))
            if key in seen:
                continue
            seen.add(key)
            lines.append(
                f"- **{item.get('check')}** ({item.get('severity', 'info')}): {item.get('message')}"
            )
    lines.append("")
    return lines


def accepted_exceptions_section(exceptions: list[dict]) -> list[str]:
    lines = ["## Accepted exceptions", ""]
    if not exceptions:
        lines.append("No classified accepted SQL exceptions in this run.")
    else:
        lines.append("These are informational and do not count as unresolved architectural defects.")
        lines.append("")
        for exc in exceptions:
            lines.append(
                f"- **{exc['category']}** ({exc['count']}): {exc['description']}"
            )
    lines.append("")
    return lines


def security_findings_section(secrets: dict, env_info: dict, checks: list[dict]) -> list[str]:
    lines = ["## Security findings", ""]
    if secrets.get("has_findings"):
        lines.append(
            f"- Potential hardcoded secrets: **{secrets.get('findings_count', '?')}** (blocking)"
        )
    else:
        lines.append("- Hardcoded secrets: none detected")
    if env_info.get("missing_count", 0):
        lines.append(
            f"- Undocumented env vars: **{env_info['missing_count']}** "
            f"({', '.join(env_info.get('used_not_documented', [])[:10])})"
        )
    else:
        lines.append("- Environment documentation: all used vars documented in examples")
    sec_checks = [c for c in checks if c.get("check", "").startswith("security")]
    for check in sec_checks:
        if check.get("status") == "pass" and check.get("check") not in {"security-audit"}:
            continue
        if check.get("status") != "pass" or check.get("check") == "security-audit":
            lines.append(
                f"- {check.get('check')}: {check.get('status')} — "
                f"{check.get('root_cause', check.get('message'))}"
            )
    lines.append("")
    return lines


def architecture_findings_section(sql_class: dict, domain_sql: dict, checks: list[dict]) -> list[str]:
    lines = ["## Architecture findings", ""]
    lines.append(
        f"- Parameterized SQL: **{domain_sql.get('input_count', 0)}** `.input(...)` bindings "
        f"across **{domain_sql.get('input_files', 0)}** file(s)"
    )
    if domain_sql.get("risky_count", 0):
        lines.append(f"- Risky dynamic SQL: **{domain_sql['risky_count']}** occurrence(s)")
    else:
        lines.append("- Risky dynamic SQL: none detected")
    lines.append(f"- Repository SQL: **{sql_class.get('repository_sql', 0)}** occurrence(s)")
    lines.append(
        f"- SQL outside repositories (warnings): **{sql_class.get('warning_sql_outside_repository', 0)}**"
    )
    arch_checks = [
        c
        for c in checks
        if "architecture" in c.get("check", "")
        or "circular" in c.get("check", "")
        or "duplication" in c.get("check", "")
        or "dead-code" in c.get("check", "")
    ]
    for check in arch_checks:
        if check.get("status") == "fail" or check.get("failure_type") == "architecture_issue":
            lines.append(
                f"- {check.get('check')}: {check.get('root_cause', check.get('message'))}"
            )
    lines.append("")
    return lines


def baseline_status_section(diff: dict | None, status: dict) -> list[str]:
    lines = ["## Baseline status", ""]
    if not diff:
        lines.append(
            "_No baseline saved yet. Run `npm run audit:baseline` after confirming audit quality._"
        )
    else:
        lines.append(f"- Baseline from: {diff.get('baseline_generated_at', 'unknown')}")
        lines.append(f"- New findings: {len(diff.get('new_findings', []))}")
        lines.append(f"- Resolved: {len(diff.get('resolved_findings', []))}")
        lines.append(f"- Persistent: {len(diff.get('persistent_findings', []))}")
    lines.append(f"- Current overall status: **{status.get('overall_status')}**")
    lines.append(f"- Blocking status: **{status.get('blocking_status')}**")
    lines.append("")
    return lines


def render_markdown(status: dict, artifacts: list[str], diff: dict | None) -> str:
    raw = audit_raw()
    sql_class = parse_sql_classification(raw)
    domain_sql = parse_domain_sql(raw)
    secrets = parse_security_secrets(raw)
    env_info = parse_security_env(raw)
    accepted = status.get("accepted_exceptions", build_accepted_exceptions(sql_class))
    non_blocking = status.get("non_blocking_findings", [])

    lines = [
        "# Code Audit Summary",
        "",
        f"Generated at: {status['generated_at']}",
        f"Audit version: **{status.get('audit_version', AUDIT_VERSION)}**",
        "",
        "## Overall status",
        "",
        f"- Mode: **diagnostic** (`npm run audit` — non-blocking by default)",
        f"- Overall status: **{status['overall_status']}**",
        f"- Blocking status: **{status.get('blocking_status', 'unknown')}** ({status.get('blocking_count', 0)} blocking)",
        f"- Max severity (excluding environment-only): **{status['max_severity']}**",
        "",
    ]
    lines.extend(blocking_checks_section(status.get("checks", [])))
    lines.extend(non_blocking_section(status.get("checks", []), non_blocking))
    lines.extend(accepted_exceptions_section(accepted))
    lines.extend(security_findings_section(secrets, env_info, status.get("checks", [])))
    lines.extend(architecture_findings_section(sql_class, domain_sql, status.get("checks", [])))
    lines.extend(npm_audit_section(status.get("checks", [])))
    lines.extend(next_actions_section(status.get("checks", [])))
    lines.extend(baseline_status_section(diff, status))
    lines.extend(environment_notes(status.get("checks", [])))

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
            "| Check | Status | Severity | Blocking | Failure type | Message |",
            "|-------|--------|----------|----------|--------------|---------|",
        ]
    )
    for check in status.get("checks", []):
        lines.append(
            f"| {check.get('check', '')} | {check.get('status', '')} | {check.get('severity', '')} | "
            f"{check.get('blocking', False)} | {check.get('failure_type', '')} | "
            f"{str(check.get('message', '')).replace('|', '/')} |"
        )

    lines.extend(root_causes_section(status.get("checks", [])))
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

    raw = audit_raw()
    sql_class = parse_sql_classification(raw)
    env_info = parse_security_env(raw)
    accepted_exceptions = build_accepted_exceptions(sql_class)
    non_blocking_findings = build_non_blocking_findings(checks, env_info, sql_class)

    baseline_path = audit_dir() / "baseline" / "audit-status.baseline.json"
    diff = compare_baseline(checks, baseline_path)

    status = {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "mode": "diagnostic",
        "audit_version": AUDIT_VERSION,
        "overall_status": overall,
        "max_severity": max_sev,
        "blocking_status": blocking_status,
        "blocking_count": blocking_count,
        "accepted_exceptions": accepted_exceptions,
        "non_blocking_findings": non_blocking_findings,
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
