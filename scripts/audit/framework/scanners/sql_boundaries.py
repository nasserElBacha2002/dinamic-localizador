"""SQL layer boundary inventory and risk flags."""

from __future__ import annotations

import re

from ..config import load_thresholds, repo_root
from ..models import AuditFinding
from ..utils import classify_layer, iter_source_files, read_text, stable_id

SQL_RE = re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b", re.I)
TENANT_TABLE_HINT = re.compile(
    r"\b(FROM|JOIN|UPDATE|INTO)\s+(dbo\.)?(employees|inventories|stores|attendance_records|"
    r"operation_assignments|payroll_receipts|conversations|whatsapp_messages)\b",
    re.I,
)
COMPANY_FILTER = re.compile(r"company_id|companyId|@companyId", re.I)


def _has_sql_in_interpolated_template(text: str) -> bool:
    """Detect SQL keywords inside a template literal that also interpolates ${...}.

    Uses a linear scan to avoid catastrophic regex backtracking on large files.
    """
    i = 0
    n = len(text)
    while i < n:
        if text[i] != "`":
            i += 1
            continue
        j = i + 1
        while j < n and text[j] != "`":
            if text[j] == "\\" and j + 1 < n:
                j += 2
                continue
            j += 1
        if j >= n:
            break
        chunk = text[i + 1 : j]
        if "${" in chunk and SQL_RE.search(chunk):
            return True
        i = j + 1
    return False


def scan() -> list[AuditFinding]:
    thresholds = load_thresholds()
    root = repo_root()
    roots = [root / "backend" / "src"]
    risk_layers = set(thresholds.get("sql", {}).get("risk_layers", ["controllers", "routes"]))
    counts: dict[str, int] = {}
    findings: list[AuditFinding] = []

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        layer = classify_layer(rel)
        text = read_text(path)
        if not SQL_RE.search(text):
            continue
        counts[layer] = counts.get(layer, 0) + 1

        if layer in risk_layers:
            findings.append(
                AuditFinding(
                    id=stable_id("sql-layer", rel),
                    category="sql",
                    subcategory="layer-boundary",
                    severity="high",
                    confidence="medium",
                    status="requires-review",
                    title=f"SQL keywords in {layer}",
                    description="SQL detected outside typical data-access layer. Confirm whether repository should own this query.",
                    file=rel,
                    evidence={"layer": layer},
                    recommendation="Move SQL to repositories when possible; keep controllers free of queries.",
                    blocking=False,
                )
            )

        if _has_sql_in_interpolated_template(text):
            findings.append(
                AuditFinding(
                    id=stable_id("sql-dyn", rel),
                    category="security",
                    subcategory="sql-injection-risk",
                    severity="high",
                    confidence="medium",
                    status="suspected",
                    title="SQL keywords inside interpolated template literal",
                    description="Template literal appears to combine SQL keywords with ${...}. Review for parameterized queries.",
                    file=rel,
                    evidence={"pattern": "sql-in-template-literal"},
                    recommendation="Use parameterized .input() / bind parameters; never interpolate user input into SQL.",
                    blocking=False,
                )
            )

        # Tenant filter heuristic — skip repositories (often parameterized via helpers)
        if layer in {"services", "controllers", "workers", "routes"}:
            if TENANT_TABLE_HINT.search(text) and not COMPANY_FILTER.search(text):
                findings.append(
                    AuditFinding(
                        id=stable_id("sql-tenant", rel),
                        category="security",
                        subcategory="tenant-isolation",
                        severity="high",
                        confidence="low",
                        status="suspected",
                        title="Tenant-aware table reference without company_id in file",
                        description=(
                            "File references a likely tenant-scoped table but has no company_id/companyId token. "
                            "False positives are common when tenant is enforced upstream."
                        ),
                        file=rel,
                        evidence={"layer": layer},
                        recommendation="Verify every tenant-scoped read/write filters by company_id (or equivalent isolation).",
                        blocking=False,
                    )
                )

    findings.append(
        AuditFinding(
            id="sql-inventory-summary",
            category="sql",
            subcategory="inventory",
            severity="info",
            confidence="high",
            status="detected",
            title="SQL presence by layer",
            description="Count of backend source files containing SQL keywords, grouped by layer.",
            evidence={"counts_by_layer": dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))},
            recommendation="Prefer SQL concentrated in repositories; investigate controllers/routes counts.",
            blocking=False,
        )
    )
    return findings
