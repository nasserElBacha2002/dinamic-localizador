#!/usr/bin/env python3
"""Audit Phase 2.7 operational table rename: static file checks and optional live DB validation."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "database" / "migrations" / "021_physical_operational_table_rename.sql"
BACKEND_SRC = REPO_ROOT / "backend" / "src"
AUDIT_DIR = REPO_ROOT / "audit"
REPORT_PATH = AUDIT_DIR / "db-operational-rename-audit.txt"
LIVE_SCRIPT = BACKEND_SRC / "scripts" / "audit-operational-rename-schema.ts"

PHYSICAL_TABLES = (
    "operational_locations",
    "scheduled_operations",
    "operation_assignments",
)

LEGACY_VIEWS = (
    "stores",
    "inventories",
    "inventory_employees",
)

WRITE_PATTERNS = [
    re.compile(rf"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE)\s+{view}\b", re.IGNORECASE)
    for view in LEGACY_VIEWS
]

SCAN_DIRS = (
    BACKEND_SRC / "repositories",
    BACKEND_SRC / "utils" / "store-fix",
    BACKEND_SRC / "scripts",
)

MANUAL_SQL = [
    "SELECT OBJECT_ID('dbo.operational_locations', 'U') AS operational_locations_table;",
    "SELECT OBJECT_ID('dbo.scheduled_operations', 'U') AS scheduled_operations_table;",
    "SELECT OBJECT_ID('dbo.operation_assignments', 'U') AS operation_assignments_table;",
    "SELECT OBJECT_ID('dbo.stores', 'V') AS stores_view;",
    "SELECT OBJECT_ID('dbo.inventories', 'V') AS inventories_view;",
    "SELECT OBJECT_ID('dbo.inventory_employees', 'V') AS inventory_employees_view;",
    "SELECT OBJECT_ID('dbo.employees', 'U') AS employees_table;",
    "SELECT OBJECT_ID('dbo.attendance_records', 'U') AS attendance_records_table;",
]


def audit_migration_file() -> list[str]:
    findings: list[str] = []
    if not MIGRATION.exists():
        findings.append("migration: missing 021_physical_operational_table_rename.sql")
        return findings

    content = MIGRATION.read_text(encoding="utf-8")

    if re.search(r"\bUSE\s+dinamic_attendance\b", content, re.IGNORECASE):
        findings.append("migration: must not hardcode USE dinamic_attendance")

    for table in PHYSICAL_TABLES:
        if table not in content:
            findings.append(f"migration: expected rename target {table}")

    for view in LEGACY_VIEWS:
        if f"CREATE VIEW dbo.{view}" not in content:
            findings.append(f"migration: expected compatibility view dbo.{view}")

    if "OBJECT_ID('dbo.stores', 'U') IS NULL" not in content:
        findings.append("migration: view creation should guard against legacy table name conflicts")

    return findings


def audit_backend_writes() -> list[str]:
    findings: list[str] = []
    for directory in SCAN_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.ts")):
            if path.name.endswith(".test.ts"):
                continue
            if path.name == "audit-operational-rename-schema.ts":
                continue
            content = path.read_text(encoding="utf-8")
            for pattern in WRITE_PATTERNS:
                if pattern.search(content):
                    findings.append(
                        f"backend: write via legacy view/table name in {path.relative_to(REPO_ROOT)}",
                    )
                    break
    return findings


def audit_repositories_use_physical_tables() -> list[str]:
    findings: list[str] = []
    repos = BACKEND_SRC / "repositories"
    if not repos.exists():
        return ["backend: repositories directory missing"]

    core_files = {
        "store.repository.ts": PHYSICAL_TABLES[0],
        "inventory.repository.ts": PHYSICAL_TABLES[1],
        "inventory-employee.repository.ts": PHYSICAL_TABLES[2],
    }
    for file_name, table_name in core_files.items():
        path = repos / file_name
        if not path.exists():
            findings.append(f"backend: missing {file_name}")
            continue
        content = path.read_text(encoding="utf-8")
        if table_name not in content:
            findings.append(f"backend: {file_name} should reference {table_name}")
    return findings


def run_live_validation() -> tuple[str, list[str]]:
    if not LIVE_SCRIPT.exists():
        return "failed", ["live: missing backend/src/scripts/audit-operational-rename-schema.ts"]

    result = subprocess.run(
        ["npx", "tsx", str(LIVE_SCRIPT)],
        cwd=REPO_ROOT / "backend",
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode == 0:
        return "passed", []

    failures = [line for line in (result.stdout + result.stderr).splitlines() if line.strip()]
    return "failed", failures or ["live: schema validation script exited with non-zero status"]


def build_report(static_findings: list[str], live_mode: bool, live_status: str, live_findings: list[str]) -> str:
    lines = [
        "DB operational rename audit (Phase 2.7)",
        "=====================================",
        "",
    ]

    if static_findings:
        lines.append(f"Static audit: {len(static_findings)} finding(s)")
        lines.extend(f"- {item}" for item in static_findings)
    else:
        lines.append("Static audit: no findings.")

    lines.append("")

    if live_mode:
        if live_status == "passed":
            lines.append("Live DB validation: passed.")
        else:
            lines.append("Live DB validation: failed.")
            lines.extend(f"- {item}" for item in live_findings)
    else:
        lines.append("Live DB validation: not executed by this report.")
        lines.append("Run: python3 scripts/audit/audit_db_operational_rename.py --live")
        lines.append("Or: cd backend && npm test -- src/database/operational-table-rename.integration.test.ts")

    lines.extend(["", "Manual SQL validation on target DB after migrations:"])
    lines.extend(MANUAL_SQL)
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Phase 2.7 operational DB rename")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Connect to DB using backend migration env and validate OBJECT_ID checks",
    )
    args = parser.parse_args()

    static_findings: list[str] = []
    static_findings.extend(audit_migration_file())
    static_findings.extend(audit_backend_writes())
    static_findings.extend(audit_repositories_use_physical_tables())

    live_status = "not_executed"
    live_findings: list[str] = []
    if args.live:
        live_status, live_findings = run_live_validation()

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        build_report(static_findings, args.live, live_status, live_findings),
        encoding="utf-8",
    )

    print(REPORT_PATH)
    for item in static_findings:
        print(item)
    for item in live_findings:
        print(item)

    if static_findings:
        return 1
    if args.live and live_status != "passed":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
