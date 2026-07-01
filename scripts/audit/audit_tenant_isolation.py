#!/usr/bin/env python3
"""Audit tenant isolation: frontend scoped API usage and backend company_id SQL scoping."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_API = REPO_ROOT / "frontend" / "src" / "api"
BACKEND_REPOS = REPO_ROOT / "backend" / "src" / "repositories"
BACKEND_ROUTES = REPO_ROOT / "backend" / "src" / "routes"
AUDIT_DIR = REPO_ROOT / "audit"
REPORT_PATH = AUDIT_DIR / "tenant-isolation-audit.txt"

GLOBAL_API_FILES = {
    "auth.api.ts",
    "companies.api.ts",
    "health.api.ts",
    "client.ts",
    "scoped-client.ts",
    "company-path.ts",
}

OPERATIONAL_PREFIXES = (
    "employees",
    "inventories",
    "stores",
    "attendance",
    "statistics",
    "absence-types",
    "absence-requests",
    "bot-simulator",
    "users",
    "settings",
)

LEGACY_API_CLIENT = re.compile(
    r'apiClient\.(get|post|put|patch|delete)\(\s*["\'`]/?('
    + "|".join(OPERATIONAL_PREFIXES)
    + r")",
)

OPERATIONAL_TABLES = (
    "employees",
    "stores",
    "inventories",
    "inventory_employees",
    "attendance_records",
    "attendance_reviews",
    "absence_requests",
    "absence_request_events",
    "bot_sessions",
    "bot_simulation_sessions",
    "whatsapp_messages",
)

DANGEROUS_WHERE_ID = re.compile(
    r"WHERE\s+id\s*=\s*@id(?!\s+AND\s+company_id)",
    re.IGNORECASE,
)

ROUTE_FILES_SKIP = {"auth.routes.ts", "health.routes.ts", "twilio.routes.ts", "index.ts"}


def audit_frontend_api() -> list[str]:
    findings: list[str] = []
    if not FRONTEND_API.exists():
        return ["frontend API directory missing"]

    for path in sorted(FRONTEND_API.glob("*.ts")):
        if path.name.endswith(".test.ts") or path.name in GLOBAL_API_FILES:
            continue
        content = path.read_text(encoding="utf-8")
        if LEGACY_API_CLIENT.search(content):
            findings.append(f"frontend: direct apiClient operational call in {path.relative_to(REPO_ROOT)}")
        if "scopedApiClient" not in content and "company-path" not in content:
            if any(prefix in content for prefix in OPERATIONAL_PREFIXES):
                findings.append(
                    f"frontend: operational API file without scopedApiClient in {path.relative_to(REPO_ROOT)}",
                )
    return findings


def audit_backend_repositories() -> list[str]:
    findings: list[str] = []
    if not BACKEND_REPOS.exists():
        return ["backend repositories directory missing"]

    for path in sorted(BACKEND_REPOS.glob("*.ts")):
        if path.name.endswith(".test.ts"):
            continue
        content = path.read_text(encoding="utf-8")
        for table in OPERATIONAL_TABLES:
            if table not in content.lower():
                continue
            for match in DANGEROUS_WHERE_ID.finditer(content):
                line = content.count("\n", 0, match.start()) + 1
                findings.append(
                    f"backend: possible unscoped WHERE id=@id in {path.relative_to(REPO_ROOT)}:{line} ({table})",
                )
    return findings


def audit_backend_routes() -> list[str]:
    findings: list[str] = []
    if not BACKEND_ROUTES.exists():
        return ["backend routes directory missing"]

    operational_route_files = [
        "employee.routes.ts",
        "store.routes.ts",
        "inventory.routes.ts",
        "inventory-assignment.routes.ts",
        "attendance.routes.ts",
        "statistics.routes.ts",
        "absence.routes.ts",
        "absence-request.routes.ts",
        "bot-simulator.routes.ts",
        "company-user.routes.ts",
    ]

    for file_name in operational_route_files:
        path = BACKEND_ROUTES / file_name
        if not path.exists():
            findings.append(f"backend: missing route file {file_name}")
            continue
        content = path.read_text(encoding="utf-8")
        if "requirePermission" not in content and "requireAnyPermission" not in content:
            findings.append(f"backend: route file without permission middleware: {file_name}")

    index = BACKEND_ROUTES / "index.ts"
    if index.exists():
        content = index.read_text(encoding="utf-8")
        company_pos = content.find('"/companies/:companyId"')
        flat_pos = content.find("operationalRouter")
        if company_pos == -1 or flat_pos == -1 or company_pos > flat_pos:
            findings.append("backend: company-scoped routes must register before legacy operationalRouter")

    return findings


def main() -> int:
    findings: list[str] = []
    findings.extend(audit_frontend_api())
    findings.extend(audit_backend_repositories())
    findings.extend(audit_backend_routes())

    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "Tenant isolation audit report",
        "===========================",
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
