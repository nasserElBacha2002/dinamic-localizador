"""Deterministic MSSQL backup file naming and retention helpers (no I/O)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

FULL_SUFFIX = "FULL"
LOG_SUFFIX = "LOG"
FULL_EXT = ".bak"
LOG_EXT = ".trn"

# {database}_{FULL|LOG}_{YYYYMMDDTHHMMSSZ}.{bak|trn}
FILE_PATTERN = re.compile(
    r"^(?P<db>[A-Za-z0-9_]+)_(?P<kind>FULL|LOG)_(?P<ts>\d{8}T\d{6}Z)(?P<ext>\.bak|\.trn)$"
)


@dataclass(frozen=True)
class BackupFileName:
    database: str
    kind: str  # FULL | LOG
    timestamp_utc: datetime
    filename: str

    @property
    def extension(self) -> str:
        return FULL_EXT if self.kind == FULL_SUFFIX else LOG_EXT


def sanitize_database_name(database: str) -> str:
    name = (database or "").strip()
    if not name or not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise ValueError(f"invalid database name for backup paths: {database!r}")
    return name


def format_utc_timestamp(moment: datetime) -> str:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    else:
        moment = moment.astimezone(timezone.utc)
    return moment.strftime("%Y%m%dT%H%M%SZ")


def build_backup_filename(database: str, kind: str, moment: datetime) -> str:
    db = sanitize_database_name(database)
    kind_norm = kind.strip().upper()
    if kind_norm not in {FULL_SUFFIX, LOG_SUFFIX}:
        raise ValueError(f"invalid backup kind: {kind!r}")
    ext = FULL_EXT if kind_norm == FULL_SUFFIX else LOG_EXT
    return f"{db}_{kind_norm}_{format_utc_timestamp(moment)}{ext}"


def container_backup_path(backup_dir: str, filename: str) -> str:
    """Join container backup directory with filename using POSIX semantics."""
    base = PurePosixPath(backup_dir)
    if ".." in PurePosixPath(filename).parts:
        raise ValueError("filename must not contain parent path segments")
    if "/" in filename or "\\" in filename:
        raise ValueError("filename must be a bare file name")
    return str(base / filename)


def parse_managed_backup_filename(filename: str) -> BackupFileName | None:
    match = FILE_PATTERN.fullmatch(filename)
    if not match:
        return None
    ext = match.group("ext")
    kind = match.group("kind")
    if kind == FULL_SUFFIX and ext != FULL_EXT:
        return None
    if kind == LOG_SUFFIX and ext != LOG_EXT:
        return None
    ts = datetime.strptime(match.group("ts"), "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    return BackupFileName(
        database=match.group("db"),
        kind=kind,
        timestamp_utc=ts,
        filename=filename,
    )


def is_managed_backup_for_database(filename: str, database: str) -> bool:
    parsed = parse_managed_backup_filename(filename)
    if parsed is None:
        return False
    return parsed.database == sanitize_database_name(database)


def retention_cutoff_utc(now_utc: datetime, retention_days: int) -> datetime:
    if retention_days < 1:
        raise ValueError("retention_days must be >= 1")
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    else:
        now_utc = now_utc.astimezone(timezone.utc)
    return now_utc - timedelta(days=retention_days)


def select_expired_managed_backups(
    filenames: list[str],
    *,
    database: str,
    now_utc: datetime,
    retention_days: int,
) -> list[str]:
    """Return only managed backup filenames for this DB older than retention."""
    cutoff = retention_cutoff_utc(now_utc, retention_days)
    expired: list[str] = []
    for name in filenames:
        parsed = parse_managed_backup_filename(name)
        if parsed is None:
            continue
        if parsed.database != sanitize_database_name(database):
            continue
        if parsed.timestamp_utc < cutoff:
            expired.append(name)
    return expired


def resolve_host_backup_dir(path: str) -> Path:
    resolved = Path(path).expanduser().resolve()
    if not str(resolved):
        raise ValueError("backup directory is empty")
    return resolved


def can_run_log_backup(*, recovery_model: str) -> tuple[bool, str]:
    """
    Pre-check before attempting BACKUP LOG.

    LOG must not alter recovery model. Only refuse when recovery is not FULL.
    A valid log chain is enforced by SQL Server itself when BACKUP LOG runs —
    do not proxy that with differential_base_lsn or historical msdb FULL rows.
    """
    model = (recovery_model or "").strip().upper()
    if model != "FULL":
        return (
            False,
            f"recovery model is {model or 'UNKNOWN'}; refuse LOG — run "
            "`scripts/mssql-backup/run-backup.sh FULL` to bootstrap FULL recovery "
            "and the initial backup chain",
        )
    return True, "ok"


def render_backup_cron_lines(
    *,
    full_hour_utc: int,
    log_command: str,
    full_command: str,
    marker_log: str = "# dinamic-mssql-backup-log",
    marker_full: str = "# dinamic-mssql-backup-full",
    marker_preamble: str = "# dinamic-mssql-backup-preamble",
) -> list[str]:
    """
    Idempotent crontab payload for Ubuntu 22.04 user cron.

    Does NOT emit CRON_TZ (unsupported / unreliable on target Ubuntu 22.04
    user crontabs). Schedules assume the host clock is UTC — install-cron.sh
    verifies that precondition.
    """
    if full_hour_utc < 0 or full_hour_utc > 23:
        raise ValueError(f"full_hour_utc must be 0-23, got {full_hour_utc}")
    return [
        f"# MSSQL backups scheduled in UTC — host timezone must be UTC {marker_preamble}",
        f"*/15 * * * * {log_command} {marker_log}",
        f"0 {full_hour_utc} * * * {full_command} {marker_full}",
    ]


def host_timezone_is_utc(tz_name: str | None, utc_offset_seconds: int | None = None) -> bool:
    """Return True when the host appears configured for UTC."""
    name = (tz_name or "").strip()
    if name in {"UTC", "Etc/UTC", "Etc/Universal", "Universal", "Zulu", "GMT", "Etc/GMT"}:
        return True
    if utc_offset_seconds is not None and utc_offset_seconds == 0 and name.upper() in {"", "UTC"}:
        return True
    if utc_offset_seconds == 0 and name in {"GMT+0", "GMT-0", "GMT0"}:
        return True
    return False
