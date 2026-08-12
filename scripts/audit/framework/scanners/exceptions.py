"""Exception-handling smell heuristics."""

from __future__ import annotations

import re

from ..config import repo_root
from ..models import AuditFinding
from ..utils import iter_source_files, read_text, stable_id

EMPTY_CATCH = re.compile(r"catch\s*(\([^)]*\))?\s*\{\s*\}", re.S)
CATCH_RETURN_NULL = re.compile(
    r"catch\s*(\([^)]*\))?\s*\{[^}]*\breturn\s+(null|undefined|false|true|\[\]|\{\})\s*;",
    re.S | re.I,
)
CATCH_LOG_ONLY = re.compile(
    r"catch\s*(\([^)]*\))?\s*\{[^}]*(console\.(log|warn|error)|logger\.(warn|error|info))\([^)]*\)\s*;?\s*\}",
    re.S,
)


def scan() -> list[AuditFinding]:
    root = repo_root()
    roots = [root / "backend" / "src"]
    findings: list[AuditFinding] = []

    for path in iter_source_files(roots):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)

        for m in EMPTY_CATCH.finditer(text):
            line = text[: m.start()].count("\n") + 1
            findings.append(
                AuditFinding(
                    id=stable_id("ex-empty", rel, str(line)),
                    category="reliability",
                    subcategory="exception-ignore",
                    severity="high",
                    confidence="high",
                    status="detected",
                    title="Empty catch block",
                    description="Errors are swallowed without logging or rethrow.",
                    file=rel,
                    line=line,
                    recommendation="Log with context, translate to domain error, or rethrow.",
                    blocking=False,
                )
            )

        for m in CATCH_RETURN_NULL.finditer(text):
            line = text[: m.start()].count("\n") + 1
            returned = re.search(r"return\s+(\w+|\[\]|\{\})", m.group(0), re.I)
            val = returned.group(1) if returned else "default"
            sev = "critical" if val.lower() in {"true"} else "medium"
            findings.append(
                AuditFinding(
                    id=stable_id("ex-default", rel, str(line), val),
                    category="reliability",
                    subcategory="exception-return-default",
                    severity=sev,  # type: ignore[arg-type]
                    confidence="medium",
                    status="suspected",
                    title=f"Catch returns {val}",
                    description="Failure path returns a default/success-like value. Confirm intentional fallback.",
                    file=rel,
                    line=line,
                    evidence={"returned": val},
                    recommendation="Avoid converting failures into success; prefer explicit Result/error types.",
                    blocking=False,
                )
            )

        for m in CATCH_LOG_ONLY.finditer(text):
            body = m.group(0)
            if "throw" in body or "return" in body:
                continue
            line = text[: m.start()].count("\n") + 1
            findings.append(
                AuditFinding(
                    id=stable_id("ex-log", rel, str(line)),
                    category="reliability",
                    subcategory="exception-log-only",
                    severity="medium",
                    confidence="low",
                    status="requires-review",
                    title="Catch logs without rethrow/return",
                    description="Possible log-and-continue pattern; verify intentional.",
                    file=rel,
                    line=line,
                    recommendation="Document fallbacks; rethrow when caller must observe failure.",
                    blocking=False,
                )
            )

    return findings
