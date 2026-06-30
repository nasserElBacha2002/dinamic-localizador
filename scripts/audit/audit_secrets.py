#!/usr/bin/env python3
"""Scan source for hardcoded secrets with reduced false positives."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

SCAN_ROOTS = [REPO_ROOT / "backend" / "src", REPO_ROOT / "frontend" / "src"]
SKIP_SUFFIXES = (".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")
SKIP_PARTS = ("/test-helpers/", "/__tests__/", "unit-test-env.ts")

SAFE_LINE_PATTERNS = [
    re.compile(r"process\.env\.[A-Z0-9_]+"),
    re.compile(r"\benv\.[A-Z0-9_]+\b"),
    re.compile(r"z\.(string|stringbool|coerce)\("),
    re.compile(r"""['"][A-Z0-9_]+['"]\s*[,:\)]"""),
    re.compile(r"is required", re.I),
    re.compile(r"passwordHash|password_hash", re.I),
    re.compile(r"//.*"),
    re.compile(r"\*.*"),
]

SECRET_ASSIGN_PATTERNS = [
    (
        re.compile(
            r"(?P<name>JWT_SECRET|TWILIO_AUTH_TOKEN|TWILIO_ACCOUNT_SID|DB_PASSWORD|GOOGLE_MAPS_API_KEY)\s*=\s*['\"](?P<val>[^'\"]{8,})['\"]"
        ),
        "hardcoded env-like assignment",
    ),
    (
        re.compile(r"(?P<name>password)\s*:\s*['\"](?P<val>[^'\"]{4,})['\"]", re.I),
        "hardcoded password literal",
    ),
    (
        re.compile(r"connectionString\s*=\s*['\"][^'\"]+Password=[^'\"]+['\"]", re.I),
        "connection string with password",
    ),
]

TOKEN_PATTERNS = [
    (re.compile(r"sk_live_[A-Za-z0-9]{10,}"), "stripe live key"),
    (re.compile(r"AC[a-zA-Z0-9]{20,}"), "twilio account sid literal"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"), "jwt-like token"),
    (re.compile(r"AIza[0-9A-Za-z_-]{20,}"), "google api key literal"),
    (re.compile(r"BEGIN (RSA |OPENSSH )?PRIVATE KEY"), "private key block"),
]

IGNORED_REFERENCE_PATTERNS = [
    re.compile(r"\bJWT_SECRET\b"),
    re.compile(r"\bTWILIO_AUTH_TOKEN\b"),
    re.compile(r"\bDB_PASSWORD\b"),
    re.compile(r"\bpasswordHash\b"),
    re.compile(r"\bpassword_hash\b"),
]


def should_scan(path: Path) -> bool:
    rel = path.relative_to(REPO_ROOT).as_posix()
    if any(rel.endswith(s) for s in SKIP_SUFFIXES):
        return False
    if any(part in rel for part in SKIP_PARTS):
        return False
    if ".example" in rel:
        return False
    return path.suffix in {".ts", ".tsx", ".js"}


def is_safe_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped or stripped.startswith("//") or stripped.startswith("*"):
        return True
    if re.search(r"process\.env\.[A-Z0-9_]+", stripped):
        return True
    if re.search(r"\benv\.[A-Z0-9_]+\b", stripped):
        return True
    if re.search(r"z\.(string|stringbool|coerce)\(", stripped):
        return True
    if re.search(r"""['"][A-Z0-9_]+['"]\s*:""", stripped):
        return True
    if re.search(r"passwordHash|password_hash", stripped, re.I):
        return True
    if re.search(r"(is required|example|placeholder|change-this-secret|ci-)", stripped, re.I):
        return True
    if re.search(r"""=\s*['"][^'"]{0,7}['"]""", stripped):
        return True
    return False


def mask_line(line: str) -> str:
    return re.sub(r"(['\"])[^'\"]{4,}(['\"])", r"\1***MASKED***\2", line.strip()[:200])


def scan_file(path: Path) -> tuple[list[str], list[str]]:
    findings: list[str] = []
    ignored: list[str] = []
    rel = path.relative_to(REPO_ROOT).as_posix()
    for idx, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1):
        if is_safe_line(line):
            if any(p.search(line) for p in IGNORED_REFERENCE_PATTERNS):
                ignored.append(f"{rel}:{idx} env/config reference ignored")
            continue

        matched = False
        for pattern, label in SECRET_ASSIGN_PATTERNS:
            if pattern.search(line):
                findings.append(f"{rel}:{idx} [{label}] {mask_line(line)}")
                matched = True
                break
        if matched:
            continue

        for pattern, label in TOKEN_PATTERNS:
            if pattern.search(line):
                findings.append(f"{rel}:{idx} [{label}] {mask_line(line)}")
                matched = True
                break
        if matched:
            continue

        if re.search(r"TWILIO_AUTH_TOKEN|JWT_SECRET|DB_PASSWORD", line) and not is_safe_line(line):
            ignored.append(f"{rel}:{idx} reference-only pattern ignored")

    return findings, ignored


def render_report(findings: list[str], ignored: list[str]) -> str:
    lines = [
        "# Security secrets audit",
        "",
        "Heuristic scan for hardcoded secrets (values masked).",
        "",
    ]
    if findings:
        lines.append("## Potential hardcoded secrets detected")
        lines.append("")
        for item in findings:
            lines.append(f"- {item}")
        lines.append("")
        lines.append(f"Total findings: **{len(findings)}**")
    else:
        lines.append("No obvious hardcoded secrets detected.")
        lines.append("")

    unique_ignored = sorted(set(ignored))[:40]
    lines.append("## Potential false-positive references ignored")
    lines.append("")
    if unique_ignored:
        for item in unique_ignored:
            lines.append(f"- {item}")
        if len(set(ignored)) > 40:
            lines.append(f"- ... and {len(set(ignored)) - 40} more ignored references")
    else:
        lines.append("- None")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: audit_secrets.py <output.md>", file=sys.stderr)
        return 2

    findings: list[str] = []
    ignored: list[str] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and should_scan(path):
                f, i = scan_file(path)
                findings.extend(f)
                ignored.extend(i)

    out = Path(sys.argv[1])
    out.write_text(render_report(findings, ignored), encoding="utf-8")
    print(f"secrets findings={len(findings)} ignored={len(set(ignored))}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
