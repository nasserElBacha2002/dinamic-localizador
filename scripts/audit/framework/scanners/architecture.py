"""Architecture import boundary heuristics driven by thresholds.json."""

from __future__ import annotations

from fnmatch import fnmatch

from ..config import load_thresholds, repo_root
from ..models import AuditFinding
from ..utils import extract_imports, iter_source_files, read_text, stable_id


def _path_matches(rel: str, from_glob: str) -> bool:
    return fnmatch(rel, from_glob) or fnmatch("/" + rel, from_glob)


def _import_matches(imp: str, pattern: str, match_mode: str) -> bool:
    if match_mode == "case_insensitive_contains":
        return pattern.lower() in imp.lower()
    return pattern in imp


def scan() -> list[AuditFinding]:
    thresholds = load_thresholds()
    rules = list(thresholds.get("architecture", {}).get("forbidden_import_patterns") or [])
    root = repo_root()
    backend = root / "backend" / "src"
    findings: list[AuditFinding] = []
    fan_out: dict[str, int] = {}
    seen: set[str] = set()

    for path in iter_source_files([backend]):
        rel = path.relative_to(root).as_posix()
        text = read_text(path)
        imports = extract_imports(text)
        fan_out[rel] = len(imports)

        for rule in rules:
            from_glob = rule.get("from_glob") or "**/*"
            if not _path_matches(rel, from_glob):
                continue
            to_pattern = rule.get("to_pattern") or ""
            match_mode = rule.get("match_mode") or "contains"
            except_to = list(rule.get("except_to_contains") or [])
            for imp in imports:
                if except_to and any(token in imp for token in except_to):
                    continue
                if not _import_matches(imp, to_pattern, match_mode):
                    continue
                finding_id = stable_id("arch", rule.get("rule", "rule"), rel, imp)
                if finding_id in seen:
                    continue
                seen.add(finding_id)
                findings.append(
                    AuditFinding(
                        id=finding_id,
                        category="architecture",
                        subcategory="layer-violation",
                        severity=rule.get("severity", "high"),  # type: ignore[arg-type]
                        confidence=rule.get("confidence", "medium"),  # type: ignore[arg-type]
                        status=rule.get("status", "requires-review"),  # type: ignore[arg-type]
                        title=rule.get("rule", "architecture-import-rule"),
                        description=f"Import '{imp}' violates rule {rule.get('rule')} (from {from_glob}).",
                        file=rel,
                        evidence={"import": imp, "rule": rule.get("rule"), "to_pattern": to_pattern},
                        recommendation="Respect layer boundaries defined in audit/config/thresholds.json.",
                        blocking=bool(rule.get("blocking", False)),
                    )
                )

    top = sorted(fan_out.items(), key=lambda kv: kv[1], reverse=True)[:15]
    findings.append(
        AuditFinding(
            id="arch-fanout-top",
            category="architecture",
            subcategory="fan-out",
            severity="info",
            confidence="high",
            status="detected",
            title="Top fan-out modules",
            description="Modules with most direct imports (coupling signal).",
            evidence={"top_fan_out": [{"file": f, "imports": n} for f, n in top]},
            recommendation="Review high fan-out modules when also flagged as god classes.",
            blocking=False,
        )
    )
    return findings
