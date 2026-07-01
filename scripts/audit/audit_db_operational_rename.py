#!/usr/bin/env python3
"""Audit Phase 2.7 operational table rename: migration file and backend SQL alignment."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "database" / "migrations" / "021_physical_operational_table_rename.sql"
BACKEND_SRC = REPO_ROOT / "backend" / "src"
AUDIT_DIR = REPO_ROOT / "audit"
REPORT_PATH = AUDIT_DIR / "db-operational-rename-audit.txt"

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
    re.compile(rf"\bINSERT\s+INTO\s+{view}\b", re.IGNORECASE)
    for view in LEGACY_VIEWS
] + [
    re.compile(rf"\bUPDATE\s+{view}\b", re.IGNORECASE)
    for view in LEGACY_VIEWS
] + [
    re.compile(rf"\bDELETE\s+FROM\s+{view}\b", re.IGNORECASE)
    for view in LEGACY_VIEWS
]

SCAN_DIRS = (
    BACKEND_SRC / "repositories",
    BACKEND_SRC / "utils" / "store-fix",
    BACKEND_SRC / "scripts",
)


def audit_migration_file() -> list[str]:
    findings: list[str] = []
    if not MIGRATION.exists():
        findings.append("migration: missing 021_physical_operational_table_rename.sql")
        return findings

    content = MIGRATION.read_text(encoding="utf-8")
    for table in PHYSICAL_TABLES:
        if table not in content:
            findings.append(f"migration: expected rename target {table}")
    for view in LEGACY_VIEWS:
        if f"CREATE VIEW dbo.{view}" not in content:
            findings.append(f"migration: expected compatibility view dbo.{view}")
    return findings


def audit_backend_writes() -> list[str]:
    findings: list[str] = []
    for directory in SCAN_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.ts")):
            if path.name.endswith(".test.ts"):
                continue
            content = path.read_text(encoding="utf-8")
            for pattern in WRITE_PATTERNS:
                if pattern.search(content):
                    findings.append(
                        f"backend: write via legacy view name in {path.relative_to(REPO_ROOT)}",
                    )
                    break
    return findings


def audit_repositories_use_physical_tables() -> list[str]:
    findings: list[str] = []
    repos = BACKEND_SRC / "repositories"
    if not repos.exists():
        return ["backend: repositories directory missing"]

    core_files = [
        "store.repository.ts",
        "inventory.repository.ts",
        "inventory-employee.repository.ts",
    ]
    for file_name in core_files:
        path = repos / file_name
        if not path.exists():
            findings.append(f"backend: missing {file_name}")
            continue
        content = path.read_text(encoding="utf-8")
        if PHYSICAL_TABLES[0] not in content and file_name == "store.repository.ts":
            findings.append(f"backend: {file_name} should reference operational_locations")
        if PHYSICAL_TABLES[1] not in content and file_name == "inventory.repository.ts":
            findings.append(f"backend: {file_name} should reference scheduled_operations")
        if PHYSICAL_TABLES[2] not in content and file_name == "inventory-employee.repository.ts":
            findings.append(f"backend: {file_name} should reference operation_assignments")
    return findings


def main() -> int:
    findings: list[str] = []
    findings.extend(audit_migration_file())
    findings.extend(audit_backend_writes())
    findings.extend(audit_repositories_use_physical_tables())

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "DB operational rename audit (Phase 2.7)",
        "=====================================",
        "",
        "Manual SQL validation:",
        "SELECT OBJECT_ID('dbo.operational_locations', 'U');",
        "SELECT OBJECT_ID('dbo.scheduled_operations', 'U');",
        "SELECT OBJECT_ID('dbo.operation_assignments', 'U');",
        "SELECT OBJECT_ID('dbo.stores', 'V');",
        "SELECT OBJECT_ID('dbo.inventories', 'V');",
        "SELECT OBJECT_ID('dbo.inventory_employees', 'V');",
        "",
    ]
    if findings:
        lines.append(f"Findings: {len(findings)}")
        lines.extend(f"- {item}" for item in findings)
    else:
        lines.append("No findings.")

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(REPORT_PATH)
    for item in findings:
        print(item)

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
