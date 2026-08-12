"""God Class / God Service multi-signal scorer."""

from __future__ import annotations

from pathlib import Path

from ..config import load_thresholds, repo_root
from ..models import AuditFinding
from ..utils import (
    branch_count,
    count_constructor_deps,
    count_methods,
    count_private_methods,
    extract_imports,
    external_integrations,
    has_direct_sql,
    infer_domains,
    iter_source_files,
    line_count,
    read_text,
    stable_id,
)


def score_file(rel: str, text: str, thresholds: dict) -> tuple[int, dict, str]:
    cfg = thresholds["god_class"]
    loc = line_count(text)
    methods = count_methods(text)
    private_methods = count_private_methods(text)
    deps = count_constructor_deps(text)
    imports = extract_imports(text)
    internal_imports = [i for i in imports if i.startswith(".") or i.startswith("@/")]
    infra_imports = [i for i in imports if any(h in i.lower() for h in ("twilio", "mssql", "google", "firebase", "axios"))]
    domains = infer_domains(text, rel)
    branches = branch_count(text)
    direct_sql = has_direct_sql(text)
    externals = external_integrations(text)
    # Approximate complex methods: high branch density files tend to have complex methods
    complex_methods = max(0, methods // 4) if branches > cfg.get("branch_proxy", 60) else max(0, branches // 25)

    score = 0
    reasons: list[str] = []

    if loc > cfg["loc_high"]:
        score += 3
        reasons.append(f"LOC>{cfg['loc_high']} (+3)")
    elif loc > cfg["loc_watch"]:
        score += 2
        reasons.append(f"LOC>{cfg['loc_watch']} (+2)")

    if methods > cfg["methods_high"]:
        score += 3
        reasons.append(f"methods>{cfg['methods_high']} (+3)")

    if deps > cfg["deps_high"]:
        score += 3
        reasons.append(f"constructor_deps>{cfg['deps_high']} (+3)")

    if len(internal_imports) > 20:
        score += 2
        reasons.append("internal_imports>20 (+2)")
    elif len(internal_imports) > cfg["imports_high"]:
        score += 2
        reasons.append(f"internal_imports>{cfg['imports_high']} (+2)")

    if branches > 100:
        score += 3
        reasons.append("high_control_flow_token_count (+3)")
    elif branches > 60:
        score += 2
        reasons.append("elevated_control_flow_token_count (+2)")

    if direct_sql and "/repositories/" not in rel.replace("\\", "/"):
        score += 3
        reasons.append("direct_sql_outside_repository (+3)")

    if externals:
        score += 2
        reasons.append(f"external_integrations={','.join(externals[:3])} (+2)")

    if len(domains) >= 4:
        score += 3
        reasons.append(f"multiple_domains={len(domains)} (+3)")
    elif len(domains) >= 3:
        score += 2
        reasons.append(f"multiple_domains={len(domains)} (+2)")

    if complex_methods >= cfg.get("complex_methods_high", 8):
        score += 2
        reasons.append(f"control_flow_density_proxy~{complex_methods} (+2)")

    if score >= cfg["score_high"]:
        band = "CRITICAL" if score >= cfg["score_high"] + 4 else "HIGH"
    elif score >= cfg["score_medium"]:
        band = "MEDIUM"
    elif score >= cfg["score_watch"]:
        band = "WATCH"
    else:
        band = "OK"

    evidence = {
        "loc": loc,
        "methods": methods,
        "private_methods": private_methods,
        "constructor_deps": deps,
        "internal_imports": len(internal_imports),
        "infra_imports": len(infra_imports),
        "domains": domains,
        "branches": branches,
        "control_flow_token_count": branches,
        "direct_sql": direct_sql,
        "external_integrations": externals,
        "control_flow_density_proxy": complex_methods,
        "complex_methods_approx": complex_methods,
        "score": score,
        "band": band,
        "reasons": reasons,
    }
    return score, evidence, band


def scan() -> list[AuditFinding]:
    thresholds = load_thresholds()
    root = repo_root()
    roots = [root / p for p in thresholds.get("scan_roots", ["backend/src"])]
    findings: list[AuditFinding] = []

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        if "/services/" not in rel and "/controllers/" not in rel:
            continue
        text = read_text(path)
        score, evidence, band = score_file(rel, text, thresholds)
        if band == "OK":
            continue

        severity_map = {
            "WATCH": "low",
            "MEDIUM": "medium",
            "HIGH": "high",
            "CRITICAL": "critical",
        }
        sev = severity_map[band]
        findings.append(
            AuditFinding(
                id=stable_id("god", rel),
                category="architecture",
                subcategory="god-class",
                severity=sev,  # type: ignore[arg-type]
                confidence="high" if score >= 16 else "medium",
                status="suspected" if band in {"WATCH", "MEDIUM"} else "requires-review",
                title=f"God service/class candidate: {Path(rel).name}",
                description=(
                    f"{Path(rel).name} scored {score} ({band}). "
                    + "; ".join(evidence["reasons"])
                ),
                file=rel,
                evidence=evidence,
                recommendation=(
                    "Split by domain responsibility; extract repositories/integrations; "
                    "keep orchestration thin. Heuristic — confirm before refactor."
                ),
                blocking=False,
            )
        )
    return findings
