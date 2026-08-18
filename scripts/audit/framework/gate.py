"""Quality gate evaluation over normalized findings + optional legacy status."""

from __future__ import annotations

from typing import Any

from .config import load_thresholds
from .models import AuditFinding, SEVERITY_ORDER, finding_key


def should_block(finding: AuditFinding, gate_cfg: dict[str, Any] | None = None) -> bool:
    """Block deterministic/confirmed risks; keep heuristic smells report-only by default."""
    cfg = gate_cfg or load_thresholds().get("gate", {})
    if finding.status in set(cfg.get("ignore_statuses") or []):
        return False
    if finding.status in {"suspected", "requires-review", "accepted-risk", "false-positive"}:
        return bool(finding.blocking)

    if finding.blocking:
        return True

    block_severities = set(cfg.get("block_severities") or ["critical"])
    if finding.severity in block_severities and finding.confidence == "high":
        return True

    if finding.severity == "high" and finding.confidence in set(
        cfg.get("block_high_with_confidence") or ["high"]
    ):
        if finding.category == "security" and finding.status in {"confirmed", "detected"}:
            return True
        if finding.status == "confirmed":
            return True
    return False


def evaluate_gate(
    findings: list[AuditFinding],
    baseline_diff: dict[str, Any] | None = None,
    regression_only: bool = False,
) -> dict[str, Any]:
    cfg = load_thresholds().get("gate", {})
    blockers: list[AuditFinding] = []

    candidates = findings
    if regression_only and baseline_diff is not None:
        new_keys = {item["key"] for item in baseline_diff.get("new_findings", [])}
        escalated_keys = {
            item["key"]
            for item in baseline_diff.get("severity_changed", [])
            if item.get("to") in {"high", "critical"}
            and SEVERITY_ORDER.index(item.get("to", "info"))
            > SEVERITY_ORDER.index(item.get("from", "info"))
        }
        candidates = [f for f in findings if finding_key(f) in new_keys or finding_key(f) in escalated_keys]

    for finding in candidates:
        if should_block(finding, cfg):
            blockers.append(finding)

    max_sev = "info"
    for f in findings:
        if f.severity in SEVERITY_ORDER and SEVERITY_ORDER.index(f.severity) > SEVERITY_ORDER.index(max_sev):
            max_sev = f.severity

    return {
        "passed": len(blockers) == 0,
        "blocking_count": len(blockers),
        "max_severity": max_sev,
        "blockers": [
            {
                "id": b.id,
                "key": finding_key(b),
                "severity": b.severity,
                "confidence": b.confidence,
                "status": b.status,
                "title": b.title,
                "file": b.file,
                "category": b.category,
            }
            for b in blockers
        ],
        "policy": cfg,
        "regression_only": regression_only,
    }
