"""File/method size and control-flow token density metric warnings.

Note: control_flow_token_count is a heuristic (if/for/while/&&/||/?? tokens),
not true cyclomatic complexity.
"""

from __future__ import annotations

from ..config import load_thresholds, repo_root
from ..models import AuditFinding
from ..utils import branch_count, iter_source_files, line_count, read_text, stable_id


def _is_app_layer(rel: str) -> bool:
    return any(f"/{layer}/" in rel for layer in ("services", "controllers", "workers", "routes"))


def scan() -> list[AuditFinding]:
    thresholds = load_thresholds()
    cfg = thresholds["complexity"]
    root = repo_root()
    roots = [root / p for p in thresholds.get("scan_roots", ["backend/src"])]
    findings: list[AuditFinding] = []
    token_high = cfg.get("control_flow_token_density_high", cfg.get("branch_density_high", 80))

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        loc = line_count(text)
        tokens = branch_count(text)
        app_layer = _is_app_layer(rel)

        if loc >= cfg["file_loc_high"]:
            findings.append(
                AuditFinding(
                    id=stable_id("cx-file", rel, "high"),
                    category="complexity",
                    subcategory="file-size",
                    severity="medium",
                    confidence="high",
                    status="detected",
                    title=f"Large file ({loc} LOC)",
                    description="File exceeds high LOC threshold. Metric warning, not automatic architecture violation.",
                    file=rel,
                    evidence={"loc": loc, "threshold": cfg["file_loc_high"]},
                    recommendation="Consider splitting only if responsibilities are mixed.",
                    blocking=False,
                )
            )
        elif loc >= cfg["file_loc_warn"] and app_layer:
            findings.append(
                AuditFinding(
                    id=stable_id("cx-file", rel, "warn"),
                    category="complexity",
                    subcategory="file-size",
                    severity="low",
                    confidence="high",
                    status="detected",
                    title=f"Large file watch ({loc} LOC)",
                    description="File exceeds watch LOC threshold.",
                    file=rel,
                    evidence={"loc": loc, "threshold": cfg["file_loc_warn"]},
                    recommendation="Monitor growth; split if cohesion drops.",
                    blocking=False,
                )
            )

        if tokens >= token_high and loc > 200 and app_layer:
            findings.append(
                AuditFinding(
                    id=stable_id("cx-tokens", rel),
                    category="complexity",
                    subcategory="control-flow-token-density",
                    severity="medium",
                    confidence="medium",
                    status="requires-review",
                    title=f"High control-flow token count ({tokens})",
                    description=(
                        "Elevated count of control-flow tokens (if/for/while/&&/||/??). "
                        "This is a complexity proxy heuristic, not cyclomatic complexity."
                    ),
                    file=rel,
                    evidence={"control_flow_token_count": tokens, "loc": loc},
                    recommendation="Extract decision tables/strategies for hot paths.",
                    blocking=False,
                )
            )

    return findings
