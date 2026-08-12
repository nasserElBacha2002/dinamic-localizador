"""Deduplicate, score hotspots, and write audit reports."""

from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .baseline import compare_findings
from .config import is_excluded, load_thresholds, repo_root
from .gate import evaluate_gate
from .io import atomic_write_json, atomic_write_text
from .models import AuditFinding, FindingValidationError, finding_key, max_severity
from .run_meta import mark_framework_completed, mark_framework_status, read_current_run
from .scanners import (
    architecture,
    complexity,
    dead_env,
    exceptions,
    god_class,
    patches,
    reliability,
    solid_grasp,
    sql_boundaries,
)

Scanner = Callable[..., list[AuditFinding]]

FULL_SCANNER_ORDER = [
    "god-classes",
    "complexity",
    "architecture",
    "sql",
    "solid",
    "grasp",
    "patches",
    "exceptions",
    "reliability",
    "env-consistency",
]


def _scan_solid() -> list[AuditFinding]:
    return solid_grasp.scan(categories={"solid"})


def _scan_grasp() -> list[AuditFinding]:
    return solid_grasp.scan(categories={"grasp"})


def _scan_solid_and_grasp() -> list[AuditFinding]:
    return solid_grasp.scan(categories=None)


SCANNERS: dict[str, Scanner] = {
    "god-classes": god_class.scan,
    "complexity": complexity.scan,
    "architecture": architecture.scan,
    "sql": sql_boundaries.scan,
    "solid": _scan_solid,
    "grasp": _scan_grasp,
    "patches": patches.scan,
    "exceptions": exceptions.scan,
    "reliability": reliability.scan,
    "env-consistency": dead_env.scan,
    # Alias kept for clarity in docs; same as env-consistency (partial dead-code coverage)
    "dead-code": dead_env.scan,
}


def dedupe(findings: list[AuditFinding]) -> list[AuditFinding]:
    best: dict[str, AuditFinding] = {}
    for finding in findings:
        key = finding_key(finding)
        prev = best.get(key)
        if prev is None:
            best[key] = finding
            continue
        if max_severity([finding.severity, prev.severity]) == finding.severity and finding.severity != prev.severity:
            best[key] = finding
    return list(best.values())


def apply_exclusions(findings: list[AuditFinding]) -> list[AuditFinding]:
    kept: list[AuditFinding] = []
    expired_notes: list[AuditFinding] = []
    for finding in findings:
        exclusion, skip_reason = is_excluded(finding.id, finding.file, finding.subcategory)
        if skip_reason:
            expired_notes.append(
                AuditFinding(
                    id=f"exclusion-skip-{finding.id}",
                    category="patches",
                    subcategory="exclusion",
                    severity="info",
                    confidence="high",
                    status="detected",
                    title="Exclusion not applied",
                    description=f"{skip_reason} for candidate {finding.id}",
                    file=finding.file,
                    evidence={"skip_reason": skip_reason, "candidate_id": finding.id},
                    blocking=False,
                )
            )
        if exclusion:
            finding.status = exclusion.get("status", "accepted-risk")  # type: ignore[assignment]
            finding.blocking = False
            finding.evidence = {
                **finding.evidence,
                "exclusion": {
                    "reason": exclusion.get("reason"),
                    "owner": exclusion.get("owner"),
                    "expires": exclusion.get("expires"),
                },
            }
        kept.append(finding)
    return kept + expired_notes


def compute_hotspots(findings: list[AuditFinding]) -> list[dict[str, Any]]:
    """Finding hotspot score = severity weights + god-class score boost.

    This is NOT a change-risk score (no git churn / coverage / bug history yet).
    """
    by_file: dict[str, list[AuditFinding]] = defaultdict(list)
    for finding in findings:
        if finding.file:
            by_file[finding.file].append(finding)

    weight = {"critical": 40, "high": 25, "medium": 12, "low": 5, "info": 1}
    rows: list[dict[str, Any]] = []
    for file, items in by_file.items():
        score = sum(weight.get(f.severity, 0) for f in items)
        for f in items:
            if f.subcategory == "god-class":
                score += int(f.evidence.get("score") or 0)
        rows.append(
            {
                "file": file,
                "score": score,
                "score_type": "finding_hotspot_score",
                "findings": len(items),
                "max_severity": max_severity([f.severity for f in items]),
                "categories": sorted({f.category for f in items}),
            }
        )
    rows.sort(key=lambda r: (-r["score"], r["file"]))
    return rows[:40]


def run_scanners(only: list[str] | None = None) -> tuple[list[AuditFinding], list[str]]:
    if only:
        selected = only
    else:
        selected = list(FULL_SCANNER_ORDER)

    findings: list[AuditFinding] = []
    ran_solid_grasp = False
    executed: list[str] = []

    for name in selected:
        if name in {"solid", "grasp"} and not only:
            # Full run: execute combined scanner once
            if ran_solid_grasp:
                executed.append(name)
                continue
            findings.extend(_scan_solid_and_grasp())
            ran_solid_grasp = True
            executed.extend(["solid", "grasp"])
            continue

        scanner = SCANNERS.get(name)
        if scanner is None:
            continue
        findings.extend(scanner())
        executed.append(name)

    # Deduplicate executed list while preserving order
    seen: set[str] = set()
    ordered: list[str] = []
    for name in executed:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return findings, ordered


def write_markdown(
    path: Path,
    findings: list[AuditFinding],
    hotspots: list[dict],
    baseline_diff: dict | None,
    gate: dict,
    *,
    run_meta: dict[str, Any],
) -> None:
    by_sev = Counter(f.severity for f in findings)
    by_cat = Counter(f.category for f in findings)
    coverage = load_thresholds().get("scanner_coverage") or {}

    lines = [
        "# Audit report",
        "",
        f"Generated: {run_meta.get('generated_at')}",
        f"Run ID: `{run_meta.get('run_id')}`",
        f"Run type: `{run_meta.get('run_type')}`",
        f"Completed: `{run_meta.get('completed')}`",
        f"Selected scanners: `{', '.join(run_meta.get('selected_scanners') or [])}`",
        "",
        "## Executive summary",
        "",
        f"- Findings: **{len(findings)}**",
        f"- Critical: {by_sev.get('critical', 0)} | High: {by_sev.get('high', 0)} | Medium: {by_sev.get('medium', 0)} | Low: {by_sev.get('low', 0)} | Info: {by_sev.get('info', 0)}",
        f"- Gate: {'PASSED' if gate.get('passed') else 'FAILED'} (blocking={gate.get('blocking_count', 0)})",
        "",
        "### By category",
        "",
    ]
    for cat, count in sorted(by_cat.items()):
        lines.append(f"- {cat}: {count}")

    lines.extend(
        [
            "",
            "## Scanner coverage",
            "",
            "### Framework (normalized into findings)",
            "",
        ]
    )
    for item in coverage.get("framework") or []:
        lines.append(f"- {item}")
    lines.extend(["", "### Legacy (not fully normalized into findings.json)", ""])
    for item in coverage.get("legacy") or []:
        lines.append(f"- {item}")

    if baseline_diff:
        c = baseline_diff.get("counts", {})
        lines.extend(
            [
                "",
                "## Baseline comparison",
                "",
                f"- Previous: {c.get('previous', 0)}",
                f"- Current: {c.get('current', 0)}",
                f"- New: {c.get('new', 0)}",
                f"- Resolved: {c.get('resolved', 0)}",
                f"- Severity changed: {c.get('severity_changed', 0)}",
            ]
        )

    lines.extend(
        [
            "",
            "## Finding hotspot score",
            "",
            "Formula: `sum(severity_weight) + god_class.score` per file.",
            "Not a change-risk score (churn/coverage/history not included).",
            "",
        ]
    )
    for row in hotspots[:20]:
        lines.append(f"- `{row['score']}` `{row['file']}` ({row['findings']} findings, max={row['max_severity']})")

    for section in (
        "security",
        "architecture",
        "complexity",
        "solid",
        "grasp",
        "sql",
        "reliability",
        "patches",
        "dead-code",
    ):
        section_items = [f for f in findings if f.category == section]
        if not section_items:
            continue
        lines.extend(["", f"## {section.title()}", ""])
        for finding in sorted(section_items, key=lambda f: (f.severity != "critical", f.severity != "high", f.file or ""))[:80]:
            loc = f"{finding.file}:{finding.line}" if finding.file and finding.line else (finding.file or "-")
            lines.append(
                f"- **[{finding.severity}/{finding.confidence}/{finding.status}]** `{finding.id}` — {finding.title} (`{loc}`)"
            )
            lines.append(f"  - {finding.description}")
            if finding.recommendation:
                lines.append(f"  - Recommendation: {finding.recommendation}")
            lines.append(f"  - Blocking: {finding.blocking}")

    gods = [f for f in findings if f.subcategory == "god-class"]
    if gods:
        lines.extend(["", "## God Classes", ""])
        for finding in sorted(gods, key=lambda f: -int(f.evidence.get("score") or 0)):
            ev = finding.evidence
            lines.append(f"### `{finding.file}`")
            lines.append("")
            lines.append(f"- LOC: {ev.get('loc')}")
            lines.append(f"- Methods: {ev.get('methods')}")
            lines.append(f"- Dependencies: {ev.get('constructor_deps')}")
            lines.append(f"- Domains: {ev.get('domains')}")
            lines.append(f"- Direct SQL: {ev.get('direct_sql')}")
            lines.append(f"- External integrations: {ev.get('external_integrations')}")
            lines.append(f"- God Service score: {ev.get('score')}")
            lines.append(f"- Severity band: {ev.get('band')}")
            lines.append(f"- Reasons: {', '.join(ev.get('reasons') or [])}")
            lines.append("")

    if run_meta.get("run_type") == "partial" and "env-consistency" in (run_meta.get("selected_scanners") or []) or (
        run_meta.get("run_type") == "partial" and "dead-code" in (run_meta.get("selected_scanners") or [])
    ):
        lines.extend(
            [
                "",
                "## Note: dead-code coverage partial",
                "",
                "This scanner covers ENV/npm inventory consistency only.",
                "Unused exports/files are covered by legacy `ts-prune` via architecture audit.",
                "",
            ]
        )

    atomic_write_text(path, "\n".join(lines) + "\n")


def _default_run_id() -> str:
    env_id = os.environ.get("AUDIT_RUN_TS") or os.environ.get("AUDIT_RUN_ID")
    if env_id:
        return env_id
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def _write_framework_status_meta(
    meta_dir: Path,
    *,
    status: str,
    severity: str,
    message: str,
    blocking: bool,
    failure_type: str,
    run_id: str,
) -> None:
    meta_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_json(
        meta_dir / "framework-deep-audit.status.json",
        {
            "check": "framework-deep-audit",
            "status": status,
            "severity": severity,
            "message": message,
            "blocking": blocking,
            "failure_type": failure_type,
            "root_cause": message,
            "run_id": run_id,
        },
    )


def validate_findings_payload(payload: dict[str, Any], *, expected_run_id: str | None = None) -> list[str]:
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["payload is not an object"]
    for key in ("run_id", "generated_at", "run_type", "completed", "finding_count", "findings", "gate"):
        if key not in payload:
            errors.append(f"missing field: {key}")
    if payload.get("completed") is not True:
        errors.append("completed is not true")
    if payload.get("run_type") != "full" and expected_run_id is not None:
        # expected_run_id checks are for full audits / gate
        pass
    if expected_run_id is not None and payload.get("run_id") != expected_run_id:
        errors.append(f"run_id mismatch: expected={expected_run_id} got={payload.get('run_id')}")
    findings = payload.get("findings")
    if not isinstance(findings, list):
        errors.append("findings must be a list")
    else:
        if payload.get("finding_count") != len(findings):
            errors.append("finding_count inconsistent with findings length")
        for item in findings:
            try:
                AuditFinding.from_dict(item)
            except FindingValidationError as exc:
                errors.append(str(exc))
                break
    return errors


def run(
    only: list[str] | None = None,
    regression_only: bool = False,
    *,
    run_id: str | None = None,
    run_type: str | None = None,
) -> dict[str, Any]:
    root = repo_root()
    audit_dir = root / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = audit_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    meta_dir = raw_dir / "_meta"

    resolved_run_id = run_id or _default_run_id()
    is_partial = bool(only)
    resolved_run_type = run_type or ("partial" if is_partial else "full")
    generated_at = datetime.now(timezone.utc).isoformat()

    try:
        raw_findings, executed = run_scanners(only=only)
        findings = apply_exclusions(dedupe(raw_findings))
        findings.sort(key=lambda f: (f.category, f.severity, f.file or "", f.id))

        baseline_path = audit_dir / "baseline" / "findings.baseline.json"
        baseline_diff = None
        if baseline_path.exists() and resolved_run_type == "full":
            data = json.loads(baseline_path.read_text(encoding="utf-8"))
            baseline_findings = [AuditFinding.from_dict(x) for x in data.get("findings", [])]
            baseline_diff = compare_findings(findings, baseline_findings)

        gate = evaluate_gate(findings, baseline_diff=baseline_diff, regression_only=regression_only)
        hotspots = compute_hotspots(findings)

        payload: dict[str, Any] = {
            "run_id": resolved_run_id,
            "generated_at": generated_at,
            "run_type": resolved_run_type,
            "selected_scanners": executed if is_partial else list(FULL_SCANNER_ORDER),
            "completed": True,
            "finding_count": len(findings),
            "findings": [f.to_dict() for f in findings],
            "hotspots": hotspots,
            "baseline_diff": baseline_diff,
            "gate": gate,
            "thresholds": load_thresholds(),
            "scanner_coverage": load_thresholds().get("scanner_coverage"),
            "hotspot_score_type": "finding_hotspot_score",
            "hotspot_formula": "sum(severity_weight) + god_class.score",
        }

        run_meta = {
            "run_id": resolved_run_id,
            "generated_at": generated_at,
            "run_type": resolved_run_type,
            "selected_scanners": payload["selected_scanners"],
            "completed": True,
        }

        if resolved_run_type == "full":
            # Atomic replace of canonical artifacts only for full runs
            atomic_write_json(audit_dir / "findings.json", payload)
            atomic_write_json(audit_dir / "audit-report.json", payload)
            write_markdown(audit_dir / "audit-report.md", findings, hotspots, baseline_diff, gate, run_meta=run_meta)
            write_markdown(audit_dir / "findings.md", findings, hotspots, baseline_diff, gate, run_meta=run_meta)
            atomic_write_json(raw_dir / "framework-findings.json", payload)
            mark_framework_completed(resolved_run_id)
            _write_framework_status_meta(
                meta_dir,
                status="pass" if gate.get("passed") else "fail",
                severity="info" if gate.get("passed") else "high",
                message=f"Framework findings={len(findings)} blocking={gate.get('blocking_count', 0)}",
                blocking=bool(gate.get("blocking_count")),
                failure_type="informational" if gate.get("passed") else "code_smell",
                run_id=resolved_run_id,
            )
        else:
            partial_dir = raw_dir / "partial"
            partial_dir.mkdir(parents=True, exist_ok=True)
            slug = "-".join(executed) if executed else "partial"
            slug = slug.replace("/", "-")[:80] or "partial"
            atomic_write_json(partial_dir / f"{slug}-findings.json", payload)
            write_markdown(
                partial_dir / f"{slug}-report.md",
                findings,
                hotspots,
                baseline_diff,
                gate,
                run_meta=run_meta,
            )
            # Explicitly do NOT touch canonical findings.json

        return payload
    except Exception as exc:  # noqa: BLE001 — framework must record failure for gate
        if resolved_run_type == "full":
            mark_framework_status(
                status="error",
                failure_type="audit_framework_failure",
                message=str(exc),
                blocking=os.environ.get("AUDIT_STRICT") == "1",
            )
            _write_framework_status_meta(
                meta_dir,
                status="error",
                severity="critical",
                message=f"Framework exception: {exc}",
                blocking=os.environ.get("AUDIT_STRICT") == "1",
                failure_type="audit_framework_failure",
                run_id=resolved_run_id,
            )
        raise


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Run deep audit framework scanners")
    parser.add_argument("--only", nargs="*", help="Scanner names to run (partial; does not overwrite canonical findings)")
    parser.add_argument("--run-id", default=None, help="Run identifier (defaults to AUDIT_RUN_TS/AUDIT_RUN_ID)")
    parser.add_argument("--run-type", choices=["full", "partial"], default=None)
    parser.add_argument("--regression-only", action="store_true")
    parser.add_argument("--print-summary", action="store_true")
    parser.add_argument("--fail-on-gate", action="store_true")
    parser.add_argument("--fail-on-error", action="store_true", help="Non-zero exit if framework raises")
    args = parser.parse_args(argv)

    try:
        payload = run(
            only=args.only,
            regression_only=args.regression_only,
            run_id=args.run_id,
            run_type=args.run_type,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"framework error: {exc}", flush=True)
        # Always non-zero so callers can detect failure; full audit shell continues in diagnostic.
        return 2

    if args.print_summary:
        gate = payload["gate"]
        print(
            f"run_id={payload['run_id']} run_type={payload['run_type']} "
            f"findings={payload['finding_count']} blocking={gate['blocking_count']} passed={gate['passed']}"
        )
        for row in payload["hotspots"][:10]:
            print(f"  hotspot {row['score']:>3} {row['file']}")

    if args.fail_on_gate and not payload["gate"]["passed"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
