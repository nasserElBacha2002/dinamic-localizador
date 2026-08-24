#!/usr/bin/env python3
"""Ensure backend env schema keys are propagated through Docker Compose."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_TS = REPO_ROOT / "backend" / "src" / "config" / "env.ts"
COMPOSE_FILES = [
    REPO_ROOT / "docker-compose.yml",
    REPO_ROOT / "docker-compose.prod.yml",
]

ZOD_KEY = re.compile(r"^\s+([A-Z][A-Z0-9_]*)\s*:\s*z\.", re.M)
COMPOSE_ENV_KEY = re.compile(r"^\s+([A-Z][A-Z0-9_]*):\s*\$\{", re.M)

# Mapped inside compose but not declared in env.ts schema.
COMPOSE_BACKEND_ALIASES = {"GOOGLE_APPLICATION_CREDENTIALS"}

# Not consumed by backend runtime inside the container (compose/host only).
COMPOSE_ONLY_KEYS = {
    "BACKEND_HOST_PORT",
    "BACKEND_INTERNAL_PORT",
    "FRONTEND_HOST_PORT",
    "DB_PORT_EXTERNAL",
    "VITE_API_URL",
    "VITE_GOOGLE_MAPS_API_KEY",
    "VITE_GOOGLE_MAPS_MAP_ID",
    "FRONTEND_IMAGE",
    "DB_MIGRATION_USER",
    "DB_MIGRATION_PASSWORD",
    "MIGRATIONS_DIR",
    "MSSQL_SA_PASSWORD",
    "RUN_DB_INTEGRATION_TESTS",
    "RUN_DB_PRIVILEGE_TESTS",
    "DB_PRIVILEGE_TEST_USER",
    "DB_PRIVILEGE_TEST_PASSWORD",
    "OWNER_PASSWORD",
    "TEST_COMPANY_ID",
    "TEST_ABSENCE_REQUEST_ID",
    "GCLOUD_PROJECT",
}

# Must appear in merged backend.environment (regression guard for production deploy).
PRODUCTION_CRITICAL_BACKEND_ENV = {
    "TWO_FACTOR_ENCRYPTION_KEY",
    "TWO_FACTOR_CHALLENGE_SECRET",
    "WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET",
    "WHATSAPP_OBSERVABILITY_ENABLED",
    "WHATSAPP_OBSERVABILITY_UI_ENABLED",
    "WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED",
}


def parse_env_schema_keys() -> set[str]:
    text = ENV_TS.read_text(encoding="utf-8")
    return set(ZOD_KEY.findall(text))


def parse_compose_backend_env_keys(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    in_backend = False
    in_environment = False
    keys: set[str] = set()
    backend_indent = None

    for line in lines:
        if re.match(r"^\s{2}backend:\s*$", line):
            in_backend = True
            in_environment = False
            backend_indent = len(line) - len(line.lstrip())
            continue

        if not in_backend:
            continue

        stripped = line.lstrip()
        indent = len(line) - len(stripped)

        if stripped and indent <= backend_indent:
            break

        if re.match(r"^\s+environment:\s*$", line):
            in_environment = True
            continue

        if not in_environment:
            continue

        if indent <= backend_indent:
            break

        match = re.match(r"^\s+([A-Z][A-Z0-9_]*):\s*\$\{", line)
        if match:
            keys.add(match.group(1))
        elif stripped and not line.startswith(" " * (backend_indent + 2)):
            in_environment = False

    return keys


def main() -> int:
    if not ENV_TS.exists():
        print(f"ERROR: missing {ENV_TS}", file=sys.stderr)
        return 2

    schema_keys = parse_env_schema_keys()
    merged_compose_keys: set[str] = set()
    for compose_file in COMPOSE_FILES:
        if not compose_file.exists():
            print(f"ERROR: missing {compose_file}", file=sys.stderr)
            return 2
        merged_compose_keys |= parse_compose_backend_env_keys(compose_file)

    expected_backend_keys = schema_keys - COMPOSE_ONLY_KEYS
    missing = sorted(expected_backend_keys - merged_compose_keys)
    missing_critical = sorted(PRODUCTION_CRITICAL_BACKEND_ENV - merged_compose_keys)
    extra_compose = sorted(merged_compose_keys - schema_keys - COMPOSE_BACKEND_ALIASES)

    if missing:
        print("ERROR: backend env schema keys missing from Docker Compose backend.environment:", file=sys.stderr)
        for key in missing:
            print(f"  - {key}", file=sys.stderr)
    if missing_critical:
        print("ERROR: production-critical backend env keys missing from Docker Compose:", file=sys.stderr)
        for key in missing_critical:
            print(f"  - {key}", file=sys.stderr)

    if extra_compose:
        print("WARNING: compose backend env keys not in env.ts schema:", file=sys.stderr)
        for key in extra_compose:
            print(f"  - {key}", file=sys.stderr)

    if missing or missing_critical:
        print(
            f"\nschema_keys={len(schema_keys)} compose_backend_keys={len(merged_compose_keys)} "
            f"missing={len(missing)} missing_critical={len(missing_critical)}",
            file=sys.stderr,
        )
        return 1

    print(
        f"OK: docker-compose backend env covers schema "
        f"({len(expected_backend_keys)} keys, {len(PRODUCTION_CRITICAL_BACKEND_ENV)} critical checked)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
