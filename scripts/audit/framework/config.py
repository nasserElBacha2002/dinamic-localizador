"""Load audit thresholds and exclusions."""

from __future__ import annotations

import json
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any


def framework_dir() -> Path:
    return Path(__file__).resolve().parent


def config_dir() -> Path:
    return framework_dir().parent / "config"


def repo_root() -> Path:
    return framework_dir().parents[2]


def clear_config_caches() -> None:
    load_thresholds.cache_clear()
    load_exclusions.cache_clear()


@lru_cache(maxsize=1)
def load_thresholds() -> dict[str, Any]:
    path = config_dir() / "thresholds.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_exclusions() -> list[dict[str, Any]]:
    path = config_dir() / "exclusions.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("exclusions") or [])


def _parse_expiry(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def is_exclusion_expired(exclusion: dict[str, Any], today: date | None = None) -> bool:
    expires = _parse_expiry(exclusion.get("expires"))
    if expires is None:
        return False
    return expires < (today or date.today())


def is_excluded(
    finding_id: str,
    file: str | None,
    rule: str | None = None,
    *,
    today: date | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Return (exclusion, skip_reason).

    skip_reason is set when a matching exclusion exists but is invalid/expired.
    """
    for exclusion in load_exclusions():
        if rule and exclusion.get("rule") and exclusion["rule"] != rule:
            continue
        if exclusion.get("id") and exclusion["id"] != finding_id:
            continue
        if exclusion.get("file") and file and exclusion["file"] not in file:
            continue
        if exclusion.get("file") and not file:
            continue

        # Match found — validate required fields
        if not exclusion.get("reason"):
            return None, "exclusion missing required reason"
        if is_exclusion_expired(exclusion, today=today):
            return None, f"expired exclusion ({exclusion.get('expires')})"
        return exclusion, None
    return None, None
