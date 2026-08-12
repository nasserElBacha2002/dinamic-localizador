"""Shared file walking and lightweight TS heuristics for audit scanners."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

SKIP_DIR_NAMES = {
    "node_modules",
    "dist",
    "coverage",
    ".git",
    "build",
    "raw",
    "runs",
}

INFRA_IMPORT_HINTS = (
    "twilio",
    "mssql",
    "@google-cloud",
    "firebase",
    "nodemailer",
    "redis",
    "axios",
    "fetch",
)

DOMAIN_HINTS = (
    "attendance",
    "employee",
    "payroll",
    "whatsapp",
    "inventory",
    "assignment",
    "store",
    "company",
    "auth",
    "notification",
    "conversation",
    "geofence",
    "reminder",
)

METHOD_RE = re.compile(
    r"^\s*(?:(?:public|private|protected|async|static|readonly|override)\s+)*"
    r"(?:async\s+)?"
    r"([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?::\s*[^{;]+)?\s*\{",
    re.M,
)
# Class/object method declarations (handles multi-line params / object-typed args)
CLASS_METHOD_RE = re.compile(
    r"^  (?:(?:public|private|protected|static|readonly|override|async)\s+)+([A-Za-z_][\w]*)\s*\(",
    re.M,
)
# Arrow / assigned methods: foo = async () => {  /  foo = () => {
ARROW_METHOD_RE = re.compile(
    r"^\s*(?:(?:public|private|protected|readonly|static)\s+)*"
    r"([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>\s*\{",
    re.M,
)
FUNCTION_RE = re.compile(
    r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][\w]*)\s*\(",
    re.M,
)
IMPORT_RE = re.compile(r"""from\s+['"]([^'"]+)['"]""")
REQUIRE_RE = re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)""")
BRANCH_RE = re.compile(r"\b(if|else if|switch|case|for|while|\?\?|\?\.|\|\||&&)\b")
CATCH_RE = re.compile(r"catch\s*(\([^)]*\))?\s*\{", re.M)
SQL_RE = re.compile(r"\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b", re.I)
NEW_CONCRETE_RE = re.compile(
    r"\bnew\s+(TwilioClient|SqlConnection|ConnectionPool|Storage|Concrete\w+Repository|\w+Repository)\s*\("
)
PATCH_COMMENT_RE = re.compile(
    r"(?:^|[^\w])(TODO|FIXME|HACK|TEMPORARY|WORKAROUND|HOTFIX|"
    r"REMOVE LATER|QUICK FIX)(?:[^\w]|$)",
    re.I,
)
# LEGACY/DEPRECATED/COMPAT/FALLBACK only when comment-like to cut prose noise
PATCH_COMPAT_RE = re.compile(
    r"(?://|/\*|\*)\s*.*\b(LEGACY|DEPRECATED|COMPAT|FALLBACK)\b",
    re.I,
)
# TEMP alone is too noisy (TEMP_DIR, temporary env names); require word forms
PATCH_TEMP_RE = re.compile(r"(?:^|[^A-Z0-9_])(TEMP)(?:\s|:|-|_FIX|_HACK|_PATCH)\b", re.I)
TS_BYPASS_RE = re.compile(
    r"@ts-ignore|@ts-expect-error|eslint-disable|\bas any\b|\bAny\b"
)


def _matches_exclude(rel_posix: str, path: Path, patterns: list[str]) -> bool:
    from fnmatch import fnmatch

    candidates = {rel_posix, path.name, path.as_posix()}
    for pattern in patterns:
        for candidate in candidates:
            if fnmatch(candidate, pattern):
                return True
            # Also match basename-oriented patterns against full path
            if fnmatch(rel_posix, pattern.lstrip("./")):
                return True
    return False


def iter_source_files(
    roots: list[Path],
    suffixes: tuple[str, ...] = (".ts", ".tsx", ".js"),
    *,
    repo: Path | None = None,
    exclude_globs: list[str] | None = None,
) -> list[Path]:
    """Walk source files applying configured exclude_globs (+ safe dir skips)."""
    from .config import load_thresholds, repo_root

    root_base = repo or repo_root()
    patterns = exclude_globs
    if patterns is None:
        patterns = list(load_thresholds().get("exclude_globs") or [])

    files: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            if path.suffix not in suffixes:
                continue
            try:
                rel = path.relative_to(root_base).as_posix()
            except ValueError:
                rel = path.as_posix()
            if _matches_exclude(rel, path, patterns):
                continue
            files.append(path)
    return sorted(files)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def line_count(text: str) -> int:
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def extract_imports(text: str) -> list[str]:
    imports = IMPORT_RE.findall(text)
    imports.extend(REQUIRE_RE.findall(text))
    return imports


def classify_layer(rel_path: str) -> str:
    parts = rel_path.replace("\\", "/").split("/")
    for marker in (
        "controllers",
        "routes",
        "services",
        "repositories",
        "middleware",
        "workers",
        "jobs",
        "scripts",
        "migrations",
        "database",
        "utils",
        "types",
        "dto",
        "config",
    ):
        if marker in parts:
            return marker
    return "other"


def infer_domains(text: str, rel_path: str) -> list[str]:
    hay = f"{rel_path}\n{text}".lower()
    found = [d for d in DOMAIN_HINTS if d in hay]
    return found


def count_methods(text: str) -> int:
    names = set(METHOD_RE.findall(text))
    names.update(FUNCTION_RE.findall(text))
    names.update(ARROW_METHOD_RE.findall(text))
    names.update(CLASS_METHOD_RE.findall(text))
    # Filter common noise
    noise = {"if", "for", "while", "switch", "catch", "constructor", "get", "set"}
    return len([n for n in names if n not in noise])


def count_private_methods(text: str) -> int:
    return len(re.findall(r"\bprivate\s+(?:async\s+)?[A-Za-z_]", text))


def count_constructor_deps(text: str) -> int:
    m = re.search(r"constructor\s*\(([^)]*)\)", text, re.S)
    if not m:
        return 0
    params = [p.strip() for p in m.group(1).split(",") if p.strip()]
    return len(params)


def branch_count(text: str) -> int:
    return len(BRANCH_RE.findall(text))


def has_direct_sql(text: str) -> bool:
    return bool(SQL_RE.search(text))


def external_integrations(text: str) -> list[str]:
    found = []
    lower = text.lower()
    for hint in INFRA_IMPORT_HINTS:
        if hint.lower() in lower:
            found.append(hint)
    return found


def stable_id(prefix: str, *parts: str) -> str:
    raw = "|".join(parts)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    return f"{prefix}-{digest}"


def layer_of_path(rel: str) -> str:
    return classify_layer(rel)
