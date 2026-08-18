"""ENV declared/read/documented consistency scanner."""

from __future__ import annotations

import re
from pathlib import Path

from ..config import repo_root
from ..models import AuditFinding
from ..utils import iter_source_files, read_text, stable_id

ENV_ACCESS = re.compile(r"process\.env\.([A-Z][A-Z0-9_]*)")
ENV_EXAMPLE_LINE = re.compile(r"^([A-Z][A-Z0-9_]*)=", re.M)


def _parse_example(path: Path) -> set[str]:
    if not path.exists():
        return set()
    text = path.read_text(encoding="utf-8", errors="replace")
    return set(ENV_EXAMPLE_LINE.findall(text))


def scan() -> list[AuditFinding]:
    root = repo_root()
    documented = set()
    for name in (".env.example", "backend/.env.example", "frontend/.env.example"):
        documented |= _parse_example(root / name)

    used: set[str] = set()
    for path in iter_source_files([root / "backend" / "src", root / "frontend" / "src", root / "scripts"]):
        used.update(ENV_ACCESS.findall(read_text(path)))

    findings: list[AuditFinding] = []

    read_undoc = sorted(used - documented)
    doc_unused = sorted(documented - used)

    if read_undoc:
        findings.append(
            AuditFinding(
                id="env-read-undocumented",
                category="dead-code",
                subcategory="env",
                severity="medium",
                confidence="medium",
                status="detected",
                title="ENV read but undocumented",
                description=f"{len(read_undoc)} env vars referenced in code but missing from .env.example files.",
                evidence={"vars": read_undoc[:80], "count": len(read_undoc)},
                recommendation="Document required/optional env vars in .env.example.",
                blocking=False,
            )
        )

    if doc_unused:
        findings.append(
            AuditFinding(
                id="env-documented-unused",
                category="dead-code",
                subcategory="env",
                severity="low",
                confidence="low",
                status="suspected",
                title="ENV documented but nonexistent in scanned sources",
                description=f"{len(doc_unused)} vars in .env.example not found via process.env.* scan (may be false positive for shell/compose).",
                evidence={"vars": doc_unused[:80], "count": len(doc_unused)},
                recommendation="Remove stale docs or note vars consumed outside process.env.",
                blocking=False,
            )
        )

    # npm scripts dead check is light: compare root package scripts referenced?
    pkg = root / "package.json"
    if pkg.exists():
        import json

        scripts = json.loads(pkg.read_text(encoding="utf-8")).get("scripts", {})
        findings.append(
            AuditFinding(
                id="npm-scripts-inventory",
                category="dead-code",
                subcategory="npm-scripts",
                severity="info",
                confidence="high",
                status="detected",
                title="Root npm scripts inventory",
                description=f"{len(scripts)} root scripts declared.",
                evidence={"scripts": sorted(scripts.keys())},
                blocking=False,
            )
        )

    return findings
