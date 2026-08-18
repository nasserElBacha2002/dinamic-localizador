"""Patch / hack / workaround / bypass scanners."""

from __future__ import annotations

from ..config import repo_root
from ..models import AuditFinding
from ..utils import (
    PATCH_COMMENT_RE,
    PATCH_COMPAT_RE,
    PATCH_TEMP_RE,
    TS_BYPASS_RE,
    iter_source_files,
    read_text,
    stable_id,
)

FALLBACK_CHAIN = r"(?:\?\?\s*[\w.]+){2,}"


def scan() -> list[AuditFinding]:
    root = repo_root()
    roots = [root / p for p in ("backend/src", "frontend/src")]
    findings: list[AuditFinding] = []
    marker_counts: dict[str, int] = {}

    import re

    fallback_re = re.compile(FALLBACK_CHAIN)
    max_detail = 80

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        for i, line in enumerate(text.splitlines(), start=1):
            m = (
                PATCH_COMMENT_RE.search(line)
                or PATCH_TEMP_RE.search(line)
                or PATCH_COMPAT_RE.search(line)
            )
            if m:
                kind = m.group(1).upper()
                marker_counts[kind] = marker_counts.get(kind, 0) + 1
                sev = "medium" if kind in {"HACK", "HOTFIX", "WORKAROUND", "FIXME"} else "low"
                if len([f for f in findings if f.category == "patches"]) < max_detail:
                    findings.append(
                        AuditFinding(
                            id=stable_id("patch", rel, str(i), kind),
                            category="patches",
                            subcategory=kind.lower(),
                            severity=sev,  # type: ignore[arg-type]
                            confidence="medium",
                            status="requires-review",
                            title=f"{kind} marker",
                            description=line.strip()[:240],
                            file=rel,
                            line=i,
                            evidence={"marker": kind},
                            recommendation="Track ownership and expiry; remove temporary patches when safe.",
                            blocking=False,
                        )
                    )
            if TS_BYPASS_RE.search(line):
                marker_counts["TYPE_BYPASS"] = marker_counts.get("TYPE_BYPASS", 0) + 1
                if len([f for f in findings if f.category == "patches"]) < max_detail:
                    findings.append(
                        AuditFinding(
                            id=stable_id("bypass", rel, str(i)),
                            category="patches",
                            subcategory="type-bypass",
                            severity="low",
                            confidence="high",
                            status="detected",
                            title="Type/lint bypass",
                            description=line.strip()[:240],
                            file=rel,
                            line=i,
                            evidence={"line": line.strip()[:200]},
                            recommendation="Prefer fixing types over suppressions; document accepted bypasses.",
                            blocking=False,
                        )
                    )
            if fallback_re.search(line) and ("legacy" in line.lower() or "compat" in line.lower() or "old" in line.lower()):
                marker_counts["FALLBACK_CHAIN"] = marker_counts.get("FALLBACK_CHAIN", 0) + 1
                if len([f for f in findings if f.category == "patches"]) < max_detail:
                    findings.append(
                        AuditFinding(
                            id=stable_id("fallback", rel, str(i)),
                            category="patches",
                            subcategory="compatibility-fallback",
                            severity="low",
                            confidence="low",
                            status="suspected",
                            title="Suspicious multi-fallback chain",
                            description=line.strip()[:240],
                            file=rel,
                            line=i,
                            recommendation="Confirm whether legacy fallbacks are still required.",
                            blocking=False,
                        )
                    )

    findings.append(
        AuditFinding(
            id="patches-summary",
            category="patches",
            subcategory="summary",
            severity="info",
            confidence="high",
            status="detected",
            title="Patch/hack/workaround marker summary",
            description="Aggregated marker counts across backend/frontend sources (detail capped).",
            evidence={"counts": marker_counts, "detail_cap": max_detail},
            recommendation="Triage HACK/FIXME/WORKAROUND first; do not treat every TODO as high severity.",
            blocking=False,
        )
    )
    return findings
