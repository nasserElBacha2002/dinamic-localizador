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
INTERP_RE = re.compile(r"\$\{([^}]{1,240})\}")

# Value-like interpolations inside SQL string literals (primary injection risk).
QUOTED_INTERP_RE = re.compile(
    r"(?:N)?'\$\{([^}]+)\}'|\"\$\{([^}]+)\}\"|LIKE\s+'%\$\{",
    re.I,
)

# Expressions treated as static / controlled when quoted (closed constants).
SAFE_QUOTED_EXPR = re.compile(
    r"^(?:"
    r"[A-Z][A-Z0-9_]*"  # MODULE_CONST
    r"|escapeSqlString\([^)]*\)"
    r"|TABLE_NAME"
    r"|FAKE_MIGRATION_NAME|RUNTIME_TEST_USER|MIGRATION_TEST_USER|DEFAULT_OPERATION_TIMEZONE|probe"
    r")$"
)

# Structural fragments (WHERE builders, CTEs, parameterized placeholder joins, etc.).
STRUCTURAL_EXPR = re.compile(
    r"(?:"
    r"whereClause|whereSql|where|cte|having|aggregatedCte|filteredBaseQuery|globalBaseQuery|"
    r"scopeSql|companyClause|companyFilter|statusFilter|simulationFilter|attendanceFilter|"
    r"excludeClause|currentAbsenceClause|expectedClause|firstAttemptClause|activeStateGuard|"
    r"scheduleJoin|lockHint|orderBy|sortColumn|sortDirection|fields\.join|placeholders\.join|"
    r"idParams\.join|valueSql\.join|values\.join|batchParams\.join|statusParams\.join|"
    r"sourceRows|selectList\.join|memberCountSelect|buildNotificationEligibilitySql|"
    r"buildEmployeeCategoryJoin|buildEmployeeLastWorkedJoin|withLock|"
    r"ACTIVE_[A-Z0-9_]+|ABSENCE_[A-Z0-9_]+|FAILURE_STATUSES_SQL|CONSOLIDATED_SAMPLE_SQL|"
    r"INCIDENT_COUNT_SQL|EFFECTIVE_STATE_SQL|isJunkOperationPredicate|"
    r"\? \"\" :| \? \"AND |\? 'AND "
    r")",
    re.I,
)


def _line_number(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def _iter_sql_templates(text: str) -> list[tuple[int, str]]:
    """Return (start_index, template_body) for backtick templates containing SQL + ${}."""
    templates: list[tuple[int, str]] = []
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
            templates.append((i + 1, chunk))
        i = j + 1
    return templates


def _classify_quoted_expr(expr: str) -> str:
    cleaned = expr.strip()
    if SAFE_QUOTED_EXPR.match(cleaned):
        return "static-or-script"
    if "escapeSqlString" in cleaned:
        return "script-generation"
    return "quoted-value"


def analyze_sql_interpolations(text: str) -> dict[str, list[dict[str, object]]]:
    """Classify interpolations inside SQL template literals."""
    quoted_risks: list[dict[str, object]] = []
    structural: list[dict[str, object]] = []
    other: list[dict[str, object]] = []

    for start, chunk in _iter_sql_templates(text):
        for qm in QUOTED_INTERP_RE.finditer(chunk):
            expr = (qm.group(1) or qm.group(2) or "").strip()
            kind = _classify_quoted_expr(expr) if expr else "quoted-value"
            entry = {
                "line": _line_number(text, start + qm.start()),
                "expr": expr or qm.group(0),
                "kind": kind,
            }
            if kind == "quoted-value":
                quoted_risks.append(entry)
            else:
                structural.append(entry)

        for im in INTERP_RE.finditer(chunk):
            expr = im.group(1).strip()
            # Skip ones already captured as quoted.
            abs_pos = start + im.start()
            window = text[max(0, abs_pos - 2) : abs_pos + len(im.group(0)) + 1]
            if QUOTED_INTERP_RE.search(window):
                continue
            entry = {
                "line": _line_number(text, abs_pos),
                "expr": expr[:160],
                "kind": "structural" if STRUCTURAL_EXPR.search(expr) else "other",
            }
            if entry["kind"] == "structural":
                structural.append(entry)
            else:
                other.append(entry)

    return {"quoted_risks": quoted_risks, "structural": structural, "other": other}


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

        analysis = analyze_sql_interpolations(text)
        quoted_risks = analysis["quoted_risks"]
        structural = analysis["structural"]
        other = analysis["other"]

        if quoted_risks:
            findings.append(
                AuditFinding(
                    id=stable_id("sql-dyn", rel),
                    category="security",
                    subcategory="sql-injection-risk",
                    severity="high",
                    confidence="high",
                    status="suspected",
                    title="Quoted value interpolation in SQL template",
                    description=(
                        "SQL template interpolates values inside string quotes (or LIKE '%${...}'). "
                        "Prefer request.input() / @parameters. Review each occurrence."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "quoted-value-interpolation",
                        "count": len(quoted_risks),
                        "samples": quoted_risks[:8],
                    },
                    recommendation="Bind runtime values with .input(); keep only closed enum constants or script generators with explicit review.",
                    blocking=False,
                )
            )
        elif structural or other:
            # Structural dynamic SQL (WHERE builders, ORDER BY whitelist fragments, @param joins).
            findings.append(
                AuditFinding(
                    id=stable_id("sql-struct", rel),
                    category="sql",
                    subcategory="sql-dynamic-structure",
                    severity="info",
                    confidence="medium",
                    status="accepted-risk",
                    title="Structural SQL template interpolation",
                    description=(
                        "Template combines SQL with ${...} fragments that look structural "
                        "(filters, CTEs, parameterized placeholder lists, constants). "
                        "Not classified as injection risk; keep values parameterized inside builders."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "structural-sql-interpolation",
                        "structural_count": len(structural),
                        "other_count": len(other),
                        "samples": (structural + other)[:8],
                    },
                    recommendation="Keep identifiers on closed whitelists; never interpolate request/body values.",
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
