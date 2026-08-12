"""Atomic file writes for critical audit artifacts."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding=encoding)
    # Best-effort fsync for durability on POSIX
    try:
        with tmp.open("rb") as handle:
            os.fsync(handle.fileno())
    except OSError:
        pass
    os.replace(tmp, path)


def atomic_write_json(path: Path, payload: dict[str, Any], indent: int = 2) -> None:
    atomic_write_text(path, json.dumps(payload, indent=indent) + "\n")
