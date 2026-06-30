#!/usr/bin/env python3
"""Compare environment variable usage against .env.example documentation."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

ENV_EXAMPLE_FILES = [REPO_ROOT / ".env.example", REPO_ROOT / "backend" / ".env.example"]
SCAN_PATHS = [
    REPO_ROOT / "backend" / "src",
    REPO_ROOT / "scripts",
    REPO_ROOT / "docker-compose.yml",
    REPO_ROOT / "docker-compose.prod.yml",
]

PROCESS_ENV = re.compile(r"process\.env\.([A-Z][A-Z0-9_]*)")
ENV_DOT = re.compile(r"\benv\.([A-Z][A-Z0-9_]*)")
COMPOSE_ENV = re.compile(r"\$\{([A-Z][A-Z0-9_]*)(?::[^}]*)?\}")
ZOD_KEY = re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*:\s*z\.", re.M)

PRODUCTION_ONLY = {
    "MSSQL_SA_PASSWORD",
    "VITE_API_URL",
    "VITE_GOOGLE_MAPS_API_KEY",
    "VITE_GOOGLE_MAPS_MAP_ID",
    "BACKEND_HOST_PORT",
    "FRONTEND_HOST_PORT",
    "BACKEND_INTERNAL_PORT",
    "DB_PORT_EXTERNAL",
    "ATTENDANCE_REMINDER_JOB_ENABLED",
}

# Variables documented under an alias or only used in compose internals / seed scripts.
DOCUMENTED_ALIASES: dict[str, str] = {
    "GOOGLE_MAPS_API_KEY": "VITE_GOOGLE_MAPS_API_KEY",
}

SCRIPT_ONLY_VARS = {
    "ADMIN_EMAIL",
    "ADMIN_NAME",
    "ADMIN_PASSWORD",
}

COMPOSE_INTERNAL_VARS = {
    "MSSQL_SA_PASSWORD",
}

REQUIRED_PRODUCTION = {
    "NODE_ENV",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "JWT_SECRET",
    "CORS_ALLOWED_ORIGINS",
    "FRONTEND_URL",
    "APP_BASE_URL",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_NUMBER",
    "TWILIO_WEBHOOK_URL",
    "TWILIO_VALIDATE_SIGNATURE",
    "BOT_OPERATION_TIMEZONE",
    "BOT_DEFAULT_RADIUS_METERS",
    "BOT_GEOFENCE_REVIEW_MARGIN_METERS",
    "BOT_ON_TIME_GRACE_MINUTES",
    "BOT_SESSION_TTL_MINUTES",
}

OPTIONAL_COMMON = {
    "TWILIO_ARRIVAL_REMINDER_CONTENT_SID",
    "TWILIO_EXIT_REMINDER_CONTENT_SID",
    "GOOGLE_MAPS_API_KEY",
    "BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES",
    "MIGRATIONS_DIR",
    "PORT",
    "TZ",
    "DB_ENCRYPT",
    "DB_TRUST_SERVER_CERTIFICATE",
    "JWT_EXPIRES_IN",
    "ATTENDANCE_REMINDER_JOB_ENABLED",
}

OPTIONAL_NO_WARN = {
    "MIGRATIONS_DIR",
}


def is_documented(var: str, documented: set[str]) -> bool:
    if var in documented:
        return True
    alias = DOCUMENTED_ALIASES.get(var)
    if alias and alias in documented:
        return True
    return False


def should_warn_undocumented(var: str, documented: set[str]) -> bool:
    if var in SCRIPT_ONLY_VARS or var in COMPOSE_INTERNAL_VARS or var in OPTIONAL_NO_WARN:
        return False
    if is_documented(var, documented):
        return False
    return True


def parse_example_keys(path: Path) -> set[str]:
    if not path.exists():
        return set()
    keys: set[str] = set()
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            keys.add(line.split("=", 1)[0].strip())
    return keys


def collect_used_keys() -> set[str]:
    used: set[str] = set()
    for target in SCAN_PATHS:
        if target.is_file():
            text = target.read_text(encoding="utf-8", errors="replace")
            used.update(PROCESS_ENV.findall(text))
            used.update(ENV_DOT.findall(text))
            used.update(COMPOSE_ENV.findall(text))
            if target.name == "env.ts" or "config/env.ts" in target.as_posix():
                used.update(ZOD_KEY.findall(text))
            continue
        if not target.exists():
            continue
        for path in target.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in {".ts", ".sh", ".yml", ".yaml", ".js"}:
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            used.update(PROCESS_ENV.findall(text))
            used.update(ENV_DOT.findall(text))
            if path.name == "env.ts":
                used.update(ZOD_KEY.findall(text))
    env_ts = REPO_ROOT / "backend" / "src" / "config" / "env.ts"
    if env_ts.exists():
        used.update(ZOD_KEY.findall(env_ts.read_text(encoding="utf-8", errors="replace")))
    return used


def render_report(used: set[str], documented: set[str]) -> str:
    documented_and_used = sorted(key for key in used if is_documented(key, documented))
    used_not_documented = sorted(key for key in used if should_warn_undocumented(key, documented))
    documented_not_used = sorted(documented - used)
    script_only_used = sorted(key for key in used if key in SCRIPT_ONLY_VARS)
    alias_satisfied = sorted(
        key for key in used if key in DOCUMENTED_ALIASES and is_documented(key, documented) and key not in documented
    )
    compose_internal = sorted(key for key in used if key in COMPOSE_INTERNAL_VARS)

    production_only = sorted((used | documented) & PRODUCTION_ONLY)
    required = sorted(REQUIRED_PRODUCTION & (used | documented))
    optional = sorted(OPTIONAL_COMMON & (used | documented))

    lines = [
        "# Environment configuration audit",
        "",
        "Compares variables referenced in backend/config, compose, and scripts against example env files.",
        "",
        f"- Variables used in code/compose: **{len(used)}**",
        f"- Variables documented in examples: **{len(documented)}**",
        "",
        "## documented_and_used",
        "",
    ]
    for key in documented_and_used:
        lines.append(f"- {key}")
    if not documented_and_used:
        lines.append("- None")

    lines.extend(["", "## used_but_not_documented (warning)", ""])
    for key in used_not_documented:
        lines.append(f"- {key}")
    if not used_not_documented:
        lines.append("- None")

    lines.extend(["", "## accepted_env_exceptions (info)", ""])
    if script_only_used:
        lines.append("Script-only variables (seed/admin tooling):")
        for key in script_only_used:
            lines.append(f"- {key}")
    if alias_satisfied:
        lines.append("Documented via alias:")
        for key in alias_satisfied:
            lines.append(f"- {key} → {DOCUMENTED_ALIASES[key]}")
    if compose_internal:
        lines.append("Compose-internal variables:")
        for key in compose_internal:
            lines.append(f"- {key}")
    if not script_only_used and not alias_satisfied and not compose_internal:
        lines.append("- None")

    lines.extend(["", "## documented_but_not_used (info)", ""])
    for key in documented_not_used:
        lines.append(f"- {key}")
    if not documented_not_used:
        lines.append("- None")

    lines.extend(["", "## production_only", ""])
    for key in production_only:
        lines.append(f"- {key}")

    lines.extend(["", "## required", ""])
    for key in required:
        status = "documented" if key in documented else "MISSING in examples"
        lines.append(f"- {key} ({status})")

    lines.extend(["", "## optional", ""])
    for key in optional:
        lines.append(f"- {key}")

    warning_count = len(used_not_documented)
    lines.extend(["", "## Summary", "", f"- used_but_not_documented: **{warning_count}**", ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: audit_env_documentation.py <output.md>", file=sys.stderr)
        return 2

    documented: set[str] = set()
    for path in ENV_EXAMPLE_FILES:
        documented |= parse_example_keys(path)

    used = collect_used_keys()
    report = render_report(used, documented)
    Path(sys.argv[1]).write_text(report, encoding="utf-8")

    used_not_documented = [key for key in used if should_warn_undocumented(key, documented)]
    print(
        f"env used={len(used)} documented={len(documented)} missing_docs={len(used_not_documented)}"
    )
    return 1 if used_not_documented else 0


if __name__ == "__main__":
    raise SystemExit(main())
