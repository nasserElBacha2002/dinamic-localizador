"""Baseline comparison for normalized findings."""

from __future__ import annotations

from typing import Any

from .models import AuditFinding, finding_key


def compare_findings(
    current: list[AuditFinding],
    baseline: list[AuditFinding],
) -> dict[str, Any]:
    current_map = {finding_key(f): f for f in current}
    baseline_map = {finding_key(f): f for f in baseline}

    new_keys = sorted(set(current_map) - set(baseline_map))
    resolved_keys = sorted(set(baseline_map) - set(current_map))
    existing_keys = sorted(set(current_map) & set(baseline_map))

    severity_changed = []
    for key in existing_keys:
        cur = current_map[key]
        base = baseline_map[key]
        if cur.severity != base.severity:
            severity_changed.append(
                {
                    "key": key,
                    "from": base.severity,
                    "to": cur.severity,
                    "id": cur.id,
                    "title": cur.title,
                    "file": cur.file,
                }
            )

    def summarize(keys: list[str], source: dict[str, AuditFinding]) -> list[dict[str, Any]]:
        out = []
        for key in keys:
            f = source[key]
            out.append(
                {
                    "id": f.id,
                    "key": key,
                    "severity": f.severity,
                    "confidence": f.confidence,
                    "status": f.status,
                    "title": f.title,
                    "file": f.file,
                    "blocking": f.blocking,
                }
            )
        return out

    return {
        "counts": {
            "previous": len(baseline),
            "current": len(current),
            "new": len(new_keys),
            "resolved": len(resolved_keys),
            "existing": len(existing_keys),
            "severity_changed": len(severity_changed),
        },
        "new_findings": summarize(new_keys, current_map),
        "resolved_findings": summarize(resolved_keys, baseline_map),
        "severity_changed": severity_changed,
    }
