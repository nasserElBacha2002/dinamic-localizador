#!/usr/bin/env python3
"""Save current audit status as confirmed baseline."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    current = root / "audit" / "audit-status.json"
    baseline_dir = root / "audit" / "baseline"
    baseline = baseline_dir / "audit-status.baseline.json"

    if not current.exists():
        print(f"Missing {current}. Run `npm run audit` first.", file=sys.stderr)
        return 1

    baseline_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(current, baseline)
    print(f"Baseline saved to {baseline}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
