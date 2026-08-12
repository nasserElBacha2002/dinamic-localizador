"""Current-run metadata shared by full audit shell, framework, gate, and baseline."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import repo_root
from .io import atomic_write_json


def audit_dir() -> Path:
    return repo_root() / "audit"


def current_run_path() -> Path:
    return audit_dir() / "current-run.json"


def findings_path() -> Path:
    return audit_dir() / "findings.json"


def write_current_run(meta: dict[str, Any]) -> None:
    atomic_write_json(current_run_path(), meta)


def read_current_run() -> dict[str, Any] | None:
    path = current_run_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def start_full_run(run_id: str) -> dict[str, Any]:
    """Mark a new full audit run and invalidate previous canonical findings."""
    meta = {
        "run_id": run_id,
        "run_type": "full",
        "status": "in_progress",
        "framework_status": "pending",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed": False,
    }
    write_current_run(meta)

    # Remove canonical findings so a stale file cannot satisfy the gate.
    findings = findings_path()
    if findings.exists():
        stale = audit_dir() / "findings.prev.json"
        try:
            findings.replace(stale)
        except OSError:
            findings.unlink(missing_ok=True)

    for name in ("audit-report.json", "audit-report.md", "findings.md"):
        path = audit_dir() / name
        if path.exists():
            path.unlink(missing_ok=True)

    return meta


def mark_framework_status(
    *,
    status: str,
    failure_type: str | None = None,
    message: str | None = None,
    blocking: bool = False,
) -> dict[str, Any]:
    meta = read_current_run() or {}
    meta["framework_status"] = status
    meta["framework_failure_type"] = failure_type
    meta["framework_message"] = message
    meta["framework_blocking"] = blocking
    meta["updated_at"] = datetime.now(timezone.utc).isoformat()
    if status == "error":
        meta["completed"] = False
    write_current_run(meta)
    return meta


def mark_framework_completed(run_id: str) -> dict[str, Any]:
    meta = read_current_run() or {}
    meta["run_id"] = run_id
    meta["framework_status"] = "ok"
    meta["framework_failure_type"] = None
    meta["framework_message"] = "Framework completed"
    meta["framework_blocking"] = False
    meta["completed"] = True
    meta["status"] = "completed"
    meta["updated_at"] = datetime.now(timezone.utc).isoformat()
    write_current_run(meta)
    return meta
