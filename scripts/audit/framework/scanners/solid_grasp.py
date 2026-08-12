"""Lightweight SOLID / GRASP heuristic scanners (suspected only)."""

from __future__ import annotations

import re

from ..config import repo_root
from ..models import AuditFinding
from ..utils import (
    classify_layer,
    count_methods,
    external_integrations,
    has_direct_sql,
    infer_domains,
    iter_source_files,
    read_text,
    stable_id,
)

SWITCH_TYPE = re.compile(r"switch\s*\(\s*\w*(type|kind|provider|status)\w*\s*\)", re.I)
IF_TYPE = re.compile(r"if\s*\(\s*[^)]*(type|provider|kind)\s*===?\s*['\"]", re.I)
NOT_IMPL = re.compile(r"throw\s+new\s+Error\(\s*['\"]NotImplemented|not implemented", re.I)
NEW_CONCRETE = re.compile(
    r"\bnew\s+(Twilio\w*|ConnectionPool|mssql\.|SqlServer\w*|Storage\w*|GCS\w*|Firebase\w*)\s*\(",
    re.I,
)


def scan(categories: set[str] | None = None) -> list[AuditFinding]:
    """Scan SOLID/GRASP heuristics.

    categories: optional filter — {"solid"}, {"grasp"}, or None for both.
    """
    root = repo_root()
    roots = [root / "backend" / "src"]
    findings: list[AuditFinding] = []
    allowed = categories

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        layer = classify_layer(rel)
        domains = infer_domains(text, rel)
        methods = count_methods(text)
        sql = has_direct_sql(text)
        externals = external_integrations(text)

        # SRP suspected
        responsibility_signals = 0
        if sql:
            responsibility_signals += 1
        if externals:
            responsibility_signals += 1
        if "authorize" in text.lower() or "permission" in text.lower():
            responsibility_signals += 1
        if len(domains) >= 3:
            responsibility_signals += 1
        if "res." in text and layer == "services":
            responsibility_signals += 1

        if responsibility_signals >= 3 and methods >= 10:
            findings.append(
                AuditFinding(
                    id=stable_id("srp", rel),
                    category="solid",
                    subcategory="srp",
                    severity="medium",
                    confidence="low",
                    status="suspected",
                    title="SUSPECTED SRP violation",
                    description=(
                        f"Multiple responsibility signals ({responsibility_signals}) in one module "
                        f"with ~{methods} methods / domains={domains}."
                    ),
                    file=rel,
                    evidence={
                        "responsibility_signals": responsibility_signals,
                        "domains": domains,
                        "methods": methods,
                        "direct_sql": sql,
                        "externals": externals,
                    },
                    recommendation="Confirm mixed concerns; extract collaborators if validated.",
                    blocking=False,
                )
            )

        # OCP — repeated type branching
        switches = len(SWITCH_TYPE.findall(text))
        ifs = len(IF_TYPE.findall(text))
        if switches + ifs >= 4:
            findings.append(
                AuditFinding(
                    id=stable_id("ocp", rel),
                    category="solid",
                    subcategory="ocp",
                    severity="low",
                    confidence="low",
                    status="suspected",
                    title="Repeated type/provider branching (OCP risk)",
                    description=f"Found ~{switches} type-switches and ~{ifs} type-ifs. Structural repetition may need strategy pattern.",
                    file=rel,
                    evidence={"switches": switches, "type_ifs": ifs},
                    recommendation="Only refactor if branching keeps growing across providers.",
                    blocking=False,
                )
            )

        if NOT_IMPL.search(text):
            findings.append(
                AuditFinding(
                    id=stable_id("lsp", rel),
                    category="solid",
                    subcategory="lsp",
                    severity="medium",
                    confidence="medium",
                    status="suspected",
                    title="LSP-RISK: NotImplemented path",
                    description="Implementation throws NotImplemented — contract may be weaker than interface.",
                    file=rel,
                    recommendation="Segregate interfaces or provide real implementations.",
                    blocking=False,
                )
            )

        if NEW_CONCRETE.search(text) and layer in {"services", "controllers"}:
            findings.append(
                AuditFinding(
                    id=stable_id("dip", rel),
                    category="solid",
                    subcategory="dip",
                    severity="low",
                    confidence="low",
                    status="suspected",
                    title="Concrete infrastructure constructed in application layer",
                    description="new <InfraClient>() found in service/controller. Factories/DI may be preferable.",
                    file=rel,
                    recommendation="Prefer injected ports; allow factories at composition root.",
                    blocking=False,
                )
            )

        # GRASP Controller
        if layer == "controllers":
            grasp_signals = sum(
                [
                    sql,
                    bool(externals),
                    "twilio" in text.lower(),
                    text.lower().count("if (") > 25,
                ]
            )
            if grasp_signals >= 2:
                findings.append(
                    AuditFinding(
                        id=stable_id("grasp-ctrl", rel),
                        category="grasp",
                        subcategory="controller",
                        severity="medium",
                        confidence="medium",
                        status="requires-review",
                        title="Controller doing too much (GRASP)",
                        description="Controller shows SQL/business branching/external calls.",
                        file=rel,
                        evidence={"signals": grasp_signals, "externals": externals},
                        recommendation="Keep controllers thin: validate → service → map response.",
                        blocking=False,
                    )
                )

        # Low cohesion candidate
        if layer == "services" and len(domains) >= 4 and methods >= 15:
            findings.append(
                AuditFinding(
                    id=stable_id("cohesion", rel),
                    category="grasp",
                    subcategory="high-cohesion",
                    severity="medium",
                    confidence="low",
                    status="suspected",
                    title="Low cohesion candidate",
                    description=f"Service touches domains {domains} with ~{methods} methods.",
                    file=rel,
                    evidence={"domains": domains, "methods": methods},
                    recommendation="Split by bounded context if method clusters are independent.",
                    blocking=False,
                )
            )

    if allowed is not None:
        findings = [f for f in findings if f.category in allowed]
    return findings
