#!/usr/bin/env python3
"""CLI entrypoint for the deep audit framework (compatible with existing audit scripts)."""

from __future__ import annotations

import sys
from pathlib import Path

AUDIT_SCRIPTS = Path(__file__).resolve().parent
if str(AUDIT_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(AUDIT_SCRIPTS))

from framework.runner import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
