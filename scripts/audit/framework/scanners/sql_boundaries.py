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

# Offline review-script generator (apply path is parameterized separately).
OFFLINE_SCRIPT_SQL_FILES = {
    "backend/src/utils/service-fix/sql.ts",
}

# Closed module fragments known to be static SQL (small explicit allowlist).
KNOWN_STATIC_SQL_FRAGMENTS = frozenset(
    {
        "ACTIVE_STATUSES_SQL",
        "FAILURE_STATUSES_SQL",
        "ABSENCE_OVERLAP_STATUS_SQL",
        "ACTIVE_BOT_SESSION_STATES_SQL",
        "CONSOLIDATED_SAMPLE_SQL",
        "INCIDENT_COUNT_SQL",
        "EFFECTIVE_STATE_SQL",
        "WORKED_MINUTES_SQL",
        "OVERTIME_MINUTES_SQL",
        "ON_TIME_WORKDAY_SQL",
        "LATE_WORKDAY_SQL",
        "PUNCTUALITY_ELIGIBLE_SQL",
        "EARLY_DEPARTURE_WORKDAY_SQL",
        "OPEN_ATTENDANCE_WORKDAY_SQL",
        "CANONICAL_PRODUCTION_ATTENDANCE_APPLY",
        "TABLE_NAME",
    }
)

# Module-level const NAME = `...` / "..." / '...' (simple literal / template).
CONST_LITERAL_RE = re.compile(
    r"(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*=\s*(?:`(?:\\`|[^`])*`|'(?:\\'|[^'])*'|\"(?:\\\"|[^\"])*\")",
    re.M,
)
# Module-level const NAME = Something.map(...).join(...) building closed SQL lists.
CONST_MAP_JOIN_RE = re.compile(
    r"(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*=\s*[A-Za-z_][\w.]*\.map\([^)]*\)\.join\(",
    re.M,
)

# Runtime-ish expression shapes (unquoted or quoted).
RUNTIME_EXPR_RE = re.compile(
    r"\b(?:input|req|request|query|params|body|headers|payload|user|ctx|context)\b"
    r"|\.query\.|\.body\.|\.params\.|\.headers\."
    r"|process\.env",
    re.I,
)

# Demonstrably safe structural patterns (not name-of-variable based).
PARAM_PLACEHOLDER_JOIN_RE = re.compile(
    r"(?:"
    r"\w*Params\.join\s*\(\s*[\"'],\s*[\"']\s*\)"
    r"|placeholders\.join\s*\(\s*[\"'],\s*[\"']\s*\)"
    r"|idParams\.join\s*\(\s*[\"'],\s*[\"']\s*\)"
    r"|batchParams\.join\s*\(\s*[\"'],\s*[\"']\s*\)"
    r"|statusParams\.join\s*\(\s*[\"'],\s*[\"']\s*\)"
    r"|values\.map\([^)]*@[^)]*\)\.join"
    r"|\.map\(\s*\([^)]*\)\s*=>\s*`@[^`]+`\s*\)\.join"
    r")",
    re.I,
)

# Ternary that only chooses between empty / static SQL string literals.
LITERAL_TERNARY_RE = re.compile(
    r"""^\s*[^?]+\?\s*(?:""|''|`[^`$]*`|"[^"$]*"|'[^'$]*')\s*:\s*(?:""|''|`[^`$]*`|"[^"$]*"|'[^'$]*')\s*$""",
)

FIELDS_JOIN_RE = re.compile(r"^fields\.join\s*\(\s*[\"'],\s*[\"']\s*\)$")
VALUE_SQL_JOIN_RE = re.compile(r"^(?:valueSql|values|sourceRows)\.join\s*\(")


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


def _collect_local_static_const_names(text: str) -> set[str]:
    names = {m.group(1) for m in CONST_LITERAL_RE.finditer(text)}
    names |= {m.group(1) for m in CONST_MAP_JOIN_RE.finditer(text)}
    return names


def _is_known_static_name(expr: str, local_statics: set[str]) -> bool:
    name = expr.strip()
    if name in KNOWN_STATIC_SQL_FRAGMENTS or name in local_statics:
        return True
    # Allow dotted re-export of a known fragment: utils.ACTIVE_STATUSES_SQL
    if "." in name:
        tail = name.rsplit(".", 1)[-1]
        if tail in KNOWN_STATIC_SQL_FRAGMENTS or tail in local_statics:
            return True
    return False


def _is_param_placeholder_join(expr: str) -> bool:
    return bool(PARAM_PLACEHOLDER_JOIN_RE.search(expr))


def _is_literal_ternary(expr: str) -> bool:
    return bool(LITERAL_TERNARY_RE.match(expr.strip()))


def _is_safe_structural(expr: str, local_statics: set[str]) -> bool:
    cleaned = expr.strip()
    if _is_known_static_name(cleaned, local_statics):
        return True
    if _is_param_placeholder_join(cleaned):
        return True
    if _is_literal_ternary(cleaned):
        return True
    if FIELDS_JOIN_RE.match(cleaned) or VALUE_SQL_JOIN_RE.match(cleaned):
        # Dynamic SET/VALUES lists built from hardcoded "col = @param" pushes.
        return True
    return False


def _is_runtime_expr(expr: str) -> bool:
    return bool(RUNTIME_EXPR_RE.search(expr))


def _contains_escape_sql_string(expr: str) -> bool:
    return "escapeSqlString" in expr


def analyze_sql_interpolations(
    text: str,
    *,
    file_path: str | None = None,
) -> dict[str, list[dict[str, object]]]:
    """Classify interpolations inside SQL template literals.

    Buckets:
    - quoted_risks: values inside quotes / LIKE '%${'
    - unquoted_runtime_risks: runtime-shaped exprs without quotes
    - escape_runtime_risks: escapeSqlString outside offline script files
    - known_safe: demonstrably static / @param joins / literal ternaries
    - unknown: everything else (must not become accepted-risk)
    """
    quoted_risks: list[dict[str, object]] = []
    unquoted_runtime_risks: list[dict[str, object]] = []
    escape_runtime_risks: list[dict[str, object]] = []
    known_safe: list[dict[str, object]] = []
    unknown: list[dict[str, object]] = []

    offline_script = bool(file_path and file_path in OFFLINE_SCRIPT_SQL_FILES)
    local_statics = _collect_local_static_const_names(text)

    for start, chunk in _iter_sql_templates(text):
        quoted_spans: list[tuple[int, int]] = []
        for qm in QUOTED_INTERP_RE.finditer(chunk):
            expr = (qm.group(1) or qm.group(2) or "").strip()
            entry = {
                "line": _line_number(text, start + qm.start()),
                "expr": expr or qm.group(0)[:160],
                "kind": "quoted-value",
            }
            quoted_spans.append((qm.start(), qm.end()))

            if offline_script and _contains_escape_sql_string(expr):
                entry["kind"] = "offline-script-generation"
                known_safe.append(entry)
                continue
            if _contains_escape_sql_string(expr):
                entry["kind"] = "escape-runtime"
                escape_runtime_risks.append(entry)
                continue
            if _is_known_static_name(expr, local_statics):
                entry["kind"] = "static-fragment"
                known_safe.append(entry)
                continue
            # Naming (USER_STATUS) is NOT proof of safety.
            quoted_risks.append(entry)

        for im in INTERP_RE.finditer(chunk):
            abs_in_chunk = im.start()
            if any(s <= abs_in_chunk < e for s, e in quoted_spans):
                continue
            expr = im.group(1).strip()
            entry = {
                "line": _line_number(text, start + abs_in_chunk),
                "expr": expr[:160],
                "kind": "unknown",
            }

            if offline_script:
                entry["kind"] = "offline-script-generation"
                known_safe.append(entry)
                continue
            if _contains_escape_sql_string(expr):
                entry["kind"] = "escape-runtime"
                escape_runtime_risks.append(entry)
                continue
            # Proven-safe shapes before runtime heuristics (e.g. input.x ? "" : "AND ...").
            if _is_safe_structural(expr, local_statics):
                entry["kind"] = "known-safe"
                known_safe.append(entry)
                continue
            if _is_runtime_expr(expr):
                entry["kind"] = "unquoted-runtime"
                unquoted_runtime_risks.append(entry)
                continue
            unknown.append(entry)

    return {
        "quoted_risks": quoted_risks,
        "unquoted_runtime_risks": unquoted_runtime_risks,
        "escape_runtime_risks": escape_runtime_risks,
        "known_safe": known_safe,
        "unknown": unknown,
        # Back-compat aliases used by older tests
        "structural": known_safe,
        "other": unknown,
    }


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

        analysis = analyze_sql_interpolations(text, file_path=rel)
        quoted_risks = analysis["quoted_risks"]
        unquoted_runtime = analysis["unquoted_runtime_risks"]
        escape_runtime = analysis["escape_runtime_risks"]
        known_safe = analysis["known_safe"]
        unknown = analysis["unknown"]

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
                        "Prefer request.input() / @parameters."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "quoted-value-interpolation",
                        "count": len(quoted_risks),
                        "samples": quoted_risks[:8],
                    },
                    recommendation="Bind runtime values with .input(); do not interpolate request/body data.",
                    blocking=False,
                )
            )

        if unquoted_runtime:
            findings.append(
                AuditFinding(
                    id=stable_id("sql-unquoted", rel),
                    category="security",
                    subcategory="sql-injection-risk",
                    severity="high",
                    confidence="medium",
                    status="requires-review",
                    title="Unquoted runtime interpolation in SQL template",
                    description=(
                        "SQL template interpolates a runtime-shaped expression without quotes "
                        "(e.g. TOP/OFFSET/WHERE id = ${input...}). Treat as injection risk until parameterized."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "unquoted-runtime-interpolation",
                        "count": len(unquoted_runtime),
                        "samples": unquoted_runtime[:8],
                    },
                    recommendation="Use @parameters via request.input(); never interpolate input/req/query values.",
                    blocking=False,
                )
            )

        if escape_runtime:
            findings.append(
                AuditFinding(
                    id=stable_id("sql-escape", rel),
                    category="security",
                    subcategory="sql-injection-risk",
                    severity="medium",
                    confidence="high",
                    status="requires-review",
                    title="Manual SQL escaping used instead of bind parameters",
                    description=(
                        "escapeSqlString(...) (or equivalent) appears in a SQL template outside the "
                        "offline service-fix script generator. Runtime queries must use bind parameters."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "escape-sql-string-runtime",
                        "count": len(escape_runtime),
                        "samples": escape_runtime[:8],
                    },
                    recommendation="Replace escaping with parameterized .input() binds for executable queries.",
                    blocking=False,
                )
            )

        if unknown:
            findings.append(
                AuditFinding(
                    id=stable_id("sql-unknown", rel),
                    category="security",
                    subcategory="sql-dynamic-unknown",
                    severity="medium",
                    confidence="medium",
                    status="requires-review",
                    title="Unknown dynamic SQL interpolation",
                    description=(
                        "SQL template interpolates ${...} that is not a proven static fragment, "
                        "@parameter placeholder list, or literal-only ternary. Manual review required."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "unknown-dynamic-sql",
                        "count": len(unknown),
                        "samples": unknown[:8],
                    },
                    recommendation=(
                        "Prove the fragment is a closed constant / whitelist result / parameterized builder, "
                        "or bind values. Do not accept unknown interpolations as safe by naming."
                    ),
                    blocking=False,
                )
            )

        if known_safe and not (quoted_risks or unquoted_runtime or escape_runtime or unknown):
            findings.append(
                AuditFinding(
                    id=stable_id("sql-struct", rel),
                    category="sql",
                    subcategory="sql-dynamic-structure",
                    severity="info",
                    confidence="medium",
                    status="accepted-risk",
                    title="Demonstrably safe structural SQL interpolation",
                    description=(
                        "SQL template interpolations are limited to known-static fragments, "
                        "@parameter placeholder joins, literal-only ternaries, or the offline "
                        "service-fix SQL script generator."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "known-safe-sql-interpolation",
                        "count": len(known_safe),
                        "samples": known_safe[:8],
                    },
                    recommendation="Keep identifiers on closed whitelists; never interpolate request/body values.",
                    blocking=False,
                )
            )
        elif known_safe:
            # Mixed file: still record known-safe for inventory, without accepting unknowns.
            findings.append(
                AuditFinding(
                    id=stable_id("sql-struct", rel),
                    category="sql",
                    subcategory="sql-dynamic-structure",
                    severity="info",
                    confidence="low",
                    status="detected",
                    title="Some known-safe SQL interpolations present",
                    description=(
                        "File also contains review/risk interpolations; known-safe samples are listed "
                        "for triage only and do not clear unknown/runtime findings."
                    ),
                    file=rel,
                    evidence={
                        "pattern": "known-safe-sql-interpolation-partial",
                        "count": len(known_safe),
                        "samples": known_safe[:8],
                    },
                    recommendation="Resolve unknown/runtime findings; keep known-safe fragments unchanged.",
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
