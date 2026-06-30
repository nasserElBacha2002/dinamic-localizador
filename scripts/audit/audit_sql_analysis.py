#!/usr/bin/env python3
"""Analyze backend SQL usage: parameterized queries and repository boundaries."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC = REPO_ROOT / "backend" / "src"

INPUT_PATTERN = re.compile(r"\.input\s*\(")
QUERY_PATTERN = re.compile(r"\.query\s*\(")
BATCH_PATTERN = re.compile(r"\.batch\s*\(")
EXECUTE_PATTERN = re.compile(r"\.execute\s*\(")

SQL_KEYWORD = re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b", re.I)
INTERPOLATION = re.compile(r"`[^`]*\$\{[^}]+\}[^`]*`")
USER_INPUT_INTERP = re.compile(
    r"\$\{(req\.(params|body|query)|params\.|body\.|query\.|userInput|externalValue|csv)",
    re.I,
)
TS_SQL_FALSE_POSITIVE = re.compile(
    r"(async\s+update\s*\(|Controller\.update|Router\.(delete|put)|\.extend\(|"
    r"===?\s*['\"]UPDATE|insert-missing|--insert|return action)",
    re.I,
)

ALLOWED_OPERATIONAL_PREFIXES = (
    "backend/src/database/",
    "backend/src/scripts/",
    "backend/src/utils/store-fix/",
    "backend/src/utils/store-reconciliation/",
)

HEALTHCHECK_FILE = "backend/src/controllers/health.controller.ts"
HEALTHCHECK_SQL = re.compile(r"SELECT\s+1", re.I)


def iter_ts_files() -> list[Path]:
    files: list[Path] = []
    if not BACKEND_SRC.exists():
        return files
    for path in BACKEND_SRC.rglob("*.ts"):
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel.endswith(".test.ts"):
            continue
        files.append(path)
    return sorted(files)


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def classify_sql_location(file_rel: str, line: str) -> str:
    if file_rel.startswith("backend/src/repositories/"):
        return "repository_sql"
    if any(file_rel.startswith(prefix) for prefix in ALLOWED_OPERATIONAL_PREFIXES):
        return "allowed_operational_sql"
    if file_rel == HEALTHCHECK_FILE and HEALTHCHECK_SQL.search(line):
        return "allowed_healthcheck_sql"
    if file_rel.startswith("backend/src/services/"):
        return "warning_sql_outside_repository"
    if file_rel.startswith("backend/src/controllers/"):
        return "warning_sql_outside_repository"
    return "warning_sql_outside_repository"


def line_contains_sql(line: str) -> bool:
    stripped = line.strip()
    if TS_SQL_FALSE_POSITIVE.search(stripped):
        return False
    if QUERY_PATTERN.search(line) or BATCH_PATTERN.search(line) or EXECUTE_PATTERN.search(line):
        return bool(
            SQL_KEYWORD.search(line)
            or re.search(r'[`"\'].*\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b', line, re.I)
        )
    if re.search(r"^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE)\b", stripped, re.I):
        return True
    if re.search(r"`\s*(SELECT|INSERT|UPDATE|DELETE|MERGE)\b", stripped, re.I):
        return True
    return False


def is_risky_query_line(line: str) -> bool:
    if not QUERY_PATTERN.search(line) and not BATCH_PATTERN.search(line):
        return False
    if "${" not in line:
        return False
    return bool(USER_INPUT_INTERP.search(line))


def analyze_parameterized(files: list[Path]) -> dict:
    input_files: set[str] = set()
    input_count = 0
    query_files: set[str] = set()
    query_count = 0
    risky: list[tuple[str, int, str]] = []

    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        file_rel = rel(path)
        file_inputs = 0

        for idx, line in enumerate(lines, start=1):
            file_inputs += len(INPUT_PATTERN.findall(line))
            if QUERY_PATTERN.search(line) or BATCH_PATTERN.search(line) or EXECUTE_PATTERN.search(line):
                query_count += 1
                query_files.add(file_rel)
                if is_risky_query_line(line):
                    risky.append((file_rel, idx, line.strip()[:160]))

        if file_inputs:
            input_files.add(file_rel)
            input_count += file_inputs

    return {
        "input_files": sorted(input_files),
        "input_count": input_count,
        "query_files": sorted(query_files),
        "query_count": query_count,
        "risky": risky,
    }


def analyze_boundaries(files: list[Path]) -> dict[str, list[tuple[str, int, str]]]:
    buckets: dict[str, list[tuple[str, int, str]]] = {
        "allowed_operational_sql": [],
        "allowed_healthcheck_sql": [],
        "repository_sql": [],
        "warning_sql_outside_repository": [],
    }
    for path in files:
        file_rel = rel(path)
        for idx, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1):
            if not line_contains_sql(line):
                continue
            category = classify_sql_location(file_rel, line)
            buckets[category].append((file_rel, idx, line.strip()[:140]))
    return buckets


def render_domain_report(param: dict) -> str:
    lines = [
        "# Backend domain rules audit",
        "",
        "## Parameterized SQL (mssql)",
        "",
        f"- Files with `.input(...)` bindings: **{len(param['input_files'])}**",
        f"- Parameter binding occurrences: **{param['input_count']}**",
        f"- Files executing SQL (`.query`/`.batch`/`.execute`): **{len(param['query_files'])}**",
        f"- SQL execution call sites: **{param['query_count']}**",
        "",
    ]
    if param["input_count"] == 0:
        lines.append("- WARNING: No `.input(...)` bindings detected.")
    else:
        lines.append("- Evidence: backend uses `mssql` parameter bindings via `.input(...)`.")
        lines.append("")
        lines.append("### Sample files with parameter bindings")
        for file_rel in param["input_files"][:12]:
            lines.append(f"- `{file_rel}`")
        if len(param["input_files"]) > 12:
            lines.append(f"- ... and {len(param['input_files']) - 12} more")

    lines.extend(["", "## Dynamic SQL risk review", ""])
    if not param["risky"]:
        lines.append("- No risky interpolated SQL detected in scanned production files.")
    else:
        lines.append(f"- Potential risky dynamic SQL: **{len(param['risky'])}** occurrence(s)")
        for file_rel, idx, snippet in param["risky"][:20]:
            lines.append(f"- `{file_rel}:{idx}` `{snippet}`")

    lines.extend(["", "## Other domain heuristics", ""])
    checks = [
        ("Twilio MessageSid idempotency", r"findByMessageSid|message_sid|MessageSid"),
        ("Bot session handling", r"bot-session|botSession|WAITING_"),
        ("Session expiration", r"expires_at|SESSION_TTL|expire"),
        ("Check-in flow", r"check-in|checkIn|isCheckInIntent|Llegu"),
        ("Check-out flow", r"checkout|isCheckoutIntent|Termin"),
        ("Geofencing/Haversine", r"haversine|geofence|distanceMeters"),
        ("Timezone usage", r"BOT_OPERATION_TIMEZONE|timeZone"),
        ("Inventory assignment validation", r"inventoryEmployee|inventory_employees"),
        ("Inventory time window", r"scheduled_start|tolerance_minutes|isWithinInventoryWindow"),
        ("Reminder deduplication", r"claimNotificationForAttempt|whatsapp_attendance_notifications"),
    ]
    for label, pattern in checks:
        count = 0
        if BACKEND_SRC.exists():
            for path in BACKEND_SRC.rglob("*.ts"):
                if path.name.endswith(".test.ts"):
                    continue
                count += len(re.findall(pattern, path.read_text(encoding="utf-8", errors="replace"), re.I))
        lines.append(f"- {label}: {count} matches")

    migrations = sorted((REPO_ROOT / "database" / "migrations").glob("*.sql")) if (REPO_ROOT / "database" / "migrations").exists() else []
    lines.extend(["", "## Migrations", ""])
    if migrations:
        for path in migrations:
            lines.append(f"- `{path.relative_to(REPO_ROOT).as_posix()}`")
    else:
        lines.append("- No migrations directory")

    return "\n".join(lines) + "\n"


def render_architecture_report(buckets: dict[str, list]) -> str:
    lines = [
        "# Backend architecture audit",
        "",
        "## SQL location classification",
        "",
        "Accepted exceptions are informational only and do not count as architectural warnings.",
        "",
    ]
    order = [
        ("allowed_operational_sql", "Allowed operational SQL", "info"),
        ("allowed_healthcheck_sql", "Allowed healthcheck SQL", "info"),
        ("repository_sql", "Repository SQL (expected)", "info"),
        ("warning_sql_outside_repository", "SQL outside repositories (review)", "warning"),
    ]
    for key, title, level in order:
        items = buckets.get(key, [])
        lines.append(f"### {title} ({level}) — {len(items)} occurrence(s)")
        if not items:
            lines.append("- None")
        else:
            seen: set[tuple[str, int]] = set()
            for file_rel, idx, snippet in items[:25]:
                marker = (file_rel, idx)
                if marker in seen:
                    continue
                seen.add(marker)
                lines.append(f"- `{file_rel}:{idx}` `{snippet}`")
            if len(items) > 25:
                lines.append(f"- ... and {len(items) - 25} more")
        lines.append("")

    warning_count = len(buckets.get("warning_sql_outside_repository", []))
    lines.append(f"## Summary: warning_sql_outside_repository = **{warning_count}**")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: audit_sql_analysis.py <domain-out.md> <architecture-out.md>", file=sys.stderr)
        return 2

    files = iter_ts_files()
    param = analyze_parameterized(files)
    buckets = analyze_boundaries(files)

    Path(sys.argv[1]).write_text(render_domain_report(param), encoding="utf-8")
    Path(sys.argv[2]).write_text(render_architecture_report(buckets), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
