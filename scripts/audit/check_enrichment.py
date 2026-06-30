"""Classify audit checks with actionable metadata."""

from __future__ import annotations

import json
import re
from pathlib import Path

SEVERITY_ORDER = ["none", "info", "low", "medium", "high", "critical"]

CHECK_EVIDENCE: dict[str, str] = {
    "frontend-eslint": "audit/raw/frontend-eslint.txt",
    "frontend-typecheck": "audit/raw/frontend-typecheck.txt",
    "frontend-test": "audit/raw/frontend-test.txt",
    "frontend-build": "audit/raw/frontend-build.txt",
    "frontend-npm-audit": "audit/raw/frontend-npm-audit.json",
    "backend-eslint": "audit/raw/backend-eslint.txt",
    "backend-typecheck": "audit/raw/backend-typecheck.txt",
    "backend-test": "audit/raw/backend-test.txt",
    "backend-build": "audit/raw/backend-build.txt",
    "backend-npm-audit": "audit/raw/backend-npm-audit.json",
    "frontend-circular-imports": "audit/raw/frontend-import-boundaries.txt",
    "backend-circular-imports": "audit/raw/backend-import-boundaries.txt",
    "frontend-duplication": "audit/raw/frontend-duplication.txt",
    "backend-duplication": "audit/raw/backend-duplication.txt",
    "frontend-dead-code": "audit/raw/frontend-dead-code.txt",
    "backend-dead-code": "audit/raw/backend-dead-code.txt",
    "security-secrets": "audit/raw/security-secrets-audit.md",
    "security-audit": "audit/raw/security-npm-audit.txt",
}

CHECK_EVIDENCE_FILES: dict[str, list[str]] = {
    "security-audit": [
        "audit/raw/security-docker-audit.md",
        "audit/raw/security-env-audit.md",
        "audit/raw/security-npm-audit.txt",
        "audit/raw/security-secrets-audit.md",
    ],
}

ENV_PATTERNS = [
    r"EPERM",
    r"operation not permitted",
    r"listen EPERM",
    r"sandbox",
    r"ECONNREFUSED",
    r"ETIMEDOUT",
    r"ENOTFOUND",
    r"getaddrinfo",
    r"tsx-.*\.pipe",
    r"Missing required environment",
    r"Could not connect",
    r"network.*unreachable",
]

TEST_FAIL_PATTERNS = [
    r"# fail [1-9]",
    r"AssertionError",
    r"\bnot ok\b",
    r"Tests failed",
    r"Test failure",
    r"Expected:.*Received:",
    r"✖ .*tests?",
    r"FAIL\s+",
]

CIRCULAR_FOUND_PATTERNS = [
    re.compile(r"Found\s+(\d+)\s+circular\s+dependenc", re.I),
    re.compile(r"[✖×]\s*Found\s+(\d+)\s+circular", re.I),
    re.compile(r"(\d+)\s+circular\s+dependenc", re.I),
]

CIRCULAR_NONE_PATTERNS = [
    re.compile(r"No circular dependenc", re.I),
    re.compile(r"0 circular dependenc", re.I),
    re.compile(r"[✔✓]\s*No circular", re.I),
]

DUPLICATION_FOUND_PATTERNS = [
    re.compile(r"Found\s+(\d+)\s+clones?", re.I),
    re.compile(r"(\d+)\s+clones?\s+found", re.I),
    re.compile(r"Total duplicated lines:\s*(\d+)", re.I),
    re.compile(r"duplicated lines:\s*(\d+)", re.I),
]

DUPLICATION_NONE_PATTERNS = [
    re.compile(r"No duplication found", re.I),
    re.compile(r"No clones found", re.I),
    re.compile(r"0 clones found", re.I),
    re.compile(r"duplicated lines:\s*0\b", re.I),
    re.compile(r"Total duplicated lines:\s*0\b", re.I),
]


def circular_import_status(text: str) -> str:
    """Return 'found', 'none', or 'unknown' for circular import evidence."""
    for pat in CIRCULAR_NONE_PATTERNS:
        if pat.search(text):
            return "none"
    for pat in CIRCULAR_FOUND_PATTERNS:
        match = pat.search(text)
        if match:
            count = int(match.group(1))
            return "found" if count > 0 else "none"
    if re.search(r"circular\s+dependenc", text, re.I) and re.search(r"[1-9]\d*", text):
        return "found"
    return "unknown"


def has_duplication_findings(text: str) -> bool:
    """True only when evidence indicates real code clones."""
    for pat in DUPLICATION_NONE_PATTERNS:
        if pat.search(text):
            return False
    for pat in DUPLICATION_FOUND_PATTERNS:
        match = pat.search(text)
        if match:
            return int(match.group(1)) > 0
    return False


def read_evidence(repo_root: Path, check: str) -> str:
    rel = CHECK_EVIDENCE.get(check)
    if not rel:
        return ""
    path = repo_root / rel
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def evidence_files_for_check(check: str, repo_root: Path) -> list[str]:
    files = CHECK_EVIDENCE_FILES.get(check, [])
    if not files and check in CHECK_EVIDENCE:
        files = [CHECK_EVIDENCE[check]]
    return [f for f in files if (repo_root / f).exists()]


def is_environment_failure(text: str) -> bool:
    return any(re.search(pat, text, re.I) for pat in ENV_PATTERNS)


def is_test_failure(text: str) -> bool:
    return any(re.search(pat, text, re.I | re.M) for pat in TEST_FAIL_PATTERNS)


def parse_npm_audit(path: Path) -> dict:
    if not path.exists():
        return {"available": False}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"available": False, "parse_error": True}

    metadata = data.get("metadata", {}).get("vulnerabilities", {})
    counts = {
        "critical": metadata.get("critical", 0),
        "high": metadata.get("high", 0),
        "moderate": metadata.get("moderate", 0),
        "low": metadata.get("low", 0),
    }
    packages: list[dict] = []
    for name, entry in data.get("vulnerabilities", {}).items():
        if name == "metadata" or not isinstance(entry, dict):
            continue
        via = entry.get("via", [])
        source = via[0] if via and isinstance(via[0], dict) else {}
        fix = entry.get("fixAvailable")
        packages.append(
            {
                "name": name,
                "severity": entry.get("severity", source.get("severity", "unknown")),
                "title": source.get("title", entry.get("title", "")),
                "fix_available": bool(fix) if fix is not None else False,
                "fix_is_major": isinstance(fix, dict) and fix.get("isSemVerMajor") is True,
            }
        )
    packages.sort(key=lambda p: SEVERITY_ORDER.index(p["severity"]) if p["severity"] in SEVERITY_ORDER else 0, reverse=True)
    return {
        "available": True,
        "counts": counts,
        "packages": packages[:15],
        "recommendation": (
            "Review lockfile changes before applying fixes. Prefer `npm audit fix` without `--force`. "
            "Avoid `--force` unless you can validate major upgrades manually."
        ),
    }


def npm_audit_severity(counts: dict) -> str:
    if counts.get("critical", 0) > 0:
        return "critical"
    if counts.get("high", 0) > 0:
        return "high"
    if counts.get("moderate", 0) > 0:
        return "medium"
    if counts.get("low", 0) > 0:
        return "low"
    return "none"


def enrich_check(check: dict, repo_root: Path) -> dict:
    name = check.get("check", "")
    status = check.get("status", "unknown")
    message = check.get("message", "")
    evidence_rel = CHECK_EVIDENCE.get(name, "")
    evidence_text = read_evidence(repo_root, name)

    enriched = dict(check)
    evidence_list = evidence_files_for_check(name, repo_root)
    enriched["evidence_file"] = evidence_list[0] if evidence_list else (CHECK_EVIDENCE.get(name) or None)
    if len(evidence_list) > 1:
        enriched["evidence_files"] = evidence_list

    failure_type = "unknown"
    root_cause = message
    action_hint = "Review evidence file for details."
    severity = check.get("severity", "none")
    blocking = False

    if name == "security-audit":
        failure_type = "unknown"
        root_cause = message or "Security audit artifacts generated (docker, env, npm, secrets)."
        action_hint = "Review all security evidence files for configuration and exposure risks."
        severity = check.get("severity", "info")
        if severity not in SEVERITY_ORDER:
            severity = "info"
    elif status == "skipped":
        failure_type = "config_missing"
        root_cause = message or "Check not configured for this package."
        action_hint = "Add the npm script or document the check as not applicable."
        severity = "info"
    elif status == "not_installed":
        failure_type = "tool_failure"
        root_cause = message or "Optional tool was not available."
        action_hint = "Install the tool or run via npx in CI for deterministic results."
        severity = "info"
    elif status == "pass":
        failure_type = "unknown"
        root_cause = message or "Check passed."
        action_hint = "No action required."
        severity = check.get("severity", "none")
        if severity not in SEVERITY_ORDER:
            severity = "none"
    elif name.endswith("-npm-audit"):
        failure_type = "dependency_vulnerability"
        audit_path = repo_root / evidence_rel if evidence_rel else None
        audit_info = parse_npm_audit(audit_path) if audit_path else {"available": False}
        enriched["npm_audit"] = audit_info
        counts = audit_info.get("counts", {})
        total = sum(counts.values()) if counts else 0
        if total:
            root_cause = (
                f"npm audit reported {counts.get('critical', 0)} critical, "
                f"{counts.get('high', 0)} high, {counts.get('moderate', 0)} moderate, "
                f"{counts.get('low', 0)} low vulnerabilities."
            )
            top = audit_info.get("packages", [])[:3]
            if top:
                pkgs = ", ".join(f"{p['name']} ({p['severity']})" for p in top)
                root_cause += f" Top packages: {pkgs}."
        else:
            root_cause = message or "npm audit exited with non-zero status."
        severity = npm_audit_severity(counts) if counts else severity
        action_hint = audit_info.get("recommendation", "Review npm audit output.")
        blocking = counts.get("critical", 0) > 0 or counts.get("high", 0) > 0
    elif name == "security-secrets":
        if status == "fail":
            failure_type = "security_issue"
            root_cause = message or "Potential hardcoded secrets detected."
            action_hint = "Remove secrets from source; use environment variables."
            severity = "critical"
            blocking = True
        else:
            failure_type = "unknown"
            root_cause = "No hardcoded secrets detected in scanned paths."
            action_hint = "No action required."
    elif "circular" in name:
        circular = circular_import_status(evidence_text)
        if circular == "found":
            count_match = next(
                (m for pat in CIRCULAR_FOUND_PATTERNS for m in [pat.search(evidence_text)] if m),
                None,
            )
            count = count_match.group(1) if count_match else "?"
            failure_type = "architecture_issue"
            root_cause = f"madge found {count} circular dependency chain(s)."
            action_hint = "Break import cycles by extracting shared modules or inverting dependencies."
            severity = "medium"
            blocking = False
        elif circular == "none":
            failure_type = "unknown"
            root_cause = "No circular dependencies detected."
            action_hint = "No action required."
            severity = check.get("severity", "none")
            if status == "fail":
                status = "pass"
        elif status == "not_installed":
            failure_type = "tool_failure"
            root_cause = "madge was not available."
            action_hint = "Run with npx madge or add as devDependency."
            severity = "info"
        else:
            failure_type = "tool_failure"
            root_cause = message or "Circular import tool failed or output was inconclusive."
            action_hint = "Inspect evidence and rerun madge locally."
            severity = "medium"
    elif name.endswith("-duplication"):
        if status == "not_installed":
            failure_type = "tool_failure"
            severity = "info"
            root_cause = message or "Optional analysis tool unavailable."
            action_hint = "Install jscpd or accept skipped analysis."
        elif has_duplication_findings(evidence_text):
            failure_type = "architecture_issue"
            root_cause = "Duplication analysis reported clones."
            action_hint = "Review duplicated blocks and extract shared helpers."
            severity = "medium"
            blocking = False
        elif status == "fail":
            failure_type = "tool_failure"
            root_cause = message or "Duplication tool failed to run."
            action_hint = "Inspect evidence and rerun jscpd locally."
            severity = "medium"
    elif name.endswith("-dead-code"):
        if status == "not_installed":
            failure_type = "tool_failure"
            severity = "info"
            root_cause = message or "Optional analysis tool unavailable."
            action_hint = "Install ts-prune or accept skipped analysis."
        elif status == "fail":
            failure_type = "architecture_issue"
            root_cause = message or "Dead code analysis reported findings."
            action_hint = "Review the evidence file for unused exports."
            severity = "medium"
            blocking = False
    elif name.endswith("-test"):
        if is_environment_failure(evidence_text):
            failure_type = "environment_failure"
            root_cause = "Test runner failed due to environment constraints (permissions/network/sandbox)."
            action_hint = "Re-run `npm test` locally outside restricted sandboxes before treating as blocking."
            severity = "high"
            blocking = False
        elif is_test_failure(evidence_text):
            failure_type = "test_failure"
            fail_line = next((ln.strip() for ln in evidence_text.splitlines() if re.search(r"# fail|not ok|AssertionError", ln, re.I)), "")
            root_cause = fail_line or "Test runner reported failing tests."
            action_hint = "Fix failing tests and rerun `npm run audit`."
            severity = "critical"
            blocking = True
        else:
            failure_type = "test_failure"
            root_cause = message or "Test command exited with non-zero status."
            action_hint = "Inspect test output; confirm failure outside sandbox."
            severity = "high"
            blocking = False
    elif name.endswith("-build"):
        if is_environment_failure(evidence_text):
            failure_type = "environment_failure"
            severity = "high"
            blocking = False
            root_cause = "Build failed due to environment constraints."
            action_hint = "Run `npm run build` locally to confirm."
        else:
            failure_type = "tool_failure"
            severity = "critical"
            blocking = True
            root_cause = _first_error_line(evidence_text) or message or "Build failed."
            action_hint = "Fix TypeScript/build errors and rerun audit."
    elif name.endswith("-typecheck") or name.endswith("-eslint"):
        if status == "fail":
            failure_type = "tool_failure" if name.endswith("-eslint") else "tool_failure"
            root_cause = _first_error_line(evidence_text) or message or "Static analysis failed."
            action_hint = "Fix lint/type errors listed in evidence."
            severity = "high" if name.endswith("-typecheck") else "medium"
            blocking = name.endswith("-typecheck")
    elif status == "fail":
        failure_type = "tool_failure"
        root_cause = _first_error_line(evidence_text) or message
        action_hint = "Review evidence file."

    enriched.update(
        {
            "status": status,
            "failure_type": failure_type,
            "root_cause": root_cause,
            "action_hint": action_hint,
            "severity": severity,
            "blocking": blocking,
        }
    )
    return enriched


def compute_blocking_status(checks: list[dict]) -> tuple[str, int]:
    blocking_checks = [
        c for c in checks if c.get("status") == "fail" and c.get("blocking") is True
    ]
    return ("fail" if blocking_checks else "pass", len(blocking_checks))


def _first_error_line(text: str) -> str:
    for line in text.splitlines():
        if re.search(r"error TS|Error:|✖|FAIL|failed", line, re.I):
            return line.strip()[:240]
    return ""
