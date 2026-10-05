#!/usr/bin/env python3
"""Unit tests for MSSQL backup path/naming/retention helpers."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import (  # noqa: E402
    build_backup_filename,
    container_backup_path,
    is_managed_backup_for_database,
    parse_managed_backup_filename,
    sanitize_database_name,
    select_expired_managed_backups,
)


class BackupPathsTest(unittest.TestCase):
    def test_sanitize_rejects_unsafe_names(self) -> None:
        with self.assertRaises(ValueError):
            sanitize_database_name("../evil")
        with self.assertRaises(ValueError):
            sanitize_database_name("db;drop")
        self.assertEqual(sanitize_database_name("dinamic_attendance"), "dinamic_attendance")

    def test_deterministic_full_and_log_names(self) -> None:
        moment = datetime(2026, 10, 1, 15, 30, 45, tzinfo=timezone.utc)
        self.assertEqual(
            build_backup_filename("dinamic_attendance", "FULL", moment),
            "dinamic_attendance_FULL_20261001T153045Z.bak",
        )
        self.assertEqual(
            build_backup_filename("dinamic_attendance", "LOG", moment),
            "dinamic_attendance_LOG_20261001T153045Z.trn",
        )

    def test_container_path_rejects_traversal(self) -> None:
        path = container_backup_path(
            "/var/opt/mssql/backup",
            "dinamic_attendance_FULL_20261001T153045Z.bak",
        )
        self.assertEqual(path, "/var/opt/mssql/backup/dinamic_attendance_FULL_20261001T153045Z.bak")
        with self.assertRaises(ValueError):
            container_backup_path("/var/opt/mssql/backup", "../other.bak")
        with self.assertRaises(ValueError):
            container_backup_path("/var/opt/mssql/backup", "a/b.bak")

    def test_parse_managed_filenames(self) -> None:
        parsed = parse_managed_backup_filename("dinamic_attendance_FULL_20261001T153045Z.bak")
        assert parsed is not None
        self.assertEqual(parsed.kind, "FULL")
        self.assertIsNone(parse_managed_backup_filename("random.sql"))
        self.assertIsNone(parse_managed_backup_filename("dinamic_attendance_FULL_20261001T153045Z.trn"))
        other = parse_managed_backup_filename("otherdb_FULL_20261001T153045Z.bak")
        self.assertIsNotNone(other)
        self.assertFalse(is_managed_backup_for_database("otherdb_FULL_20261001T153045Z.bak", "dinamic_attendance"))
        self.assertTrue(is_managed_backup_for_database("dinamic_attendance_LOG_20261001T153045Z.trn", "dinamic_attendance"))
        self.assertFalse(is_managed_backup_for_database("other_LOG_20261001T153045Z.trn", "dinamic_attendance"))

    def test_retention_excludes_foreign_and_recent(self) -> None:
        now = datetime(2026, 10, 15, 12, 0, 0, tzinfo=timezone.utc)
        # cutoff = 2026-10-01T12:00:00Z for retention_days=14
        names = [
            "dinamic_attendance_FULL_20260901T120000Z.bak",  # expired
            "dinamic_attendance_LOG_20261010T120000Z.trn",  # recent (kept)
            "otherdb_FULL_20260901T120000Z.bak",  # foreign (ignored)
            "notes.txt",  # unmanaged
            "dinamic_attendance_FULL_20261001T120000Z.bak",  # exact cutoff (kept: not < cutoff)
            "dinamic_attendance_FULL_20260930T120000Z.bak",  # expired
            "../escape.bak",
        ]
        expired = select_expired_managed_backups(
            names,
            database="dinamic_attendance",
            now_utc=now,
            retention_days=14,
        )
        self.assertEqual(
            expired,
            [
                "dinamic_attendance_FULL_20260901T120000Z.bak",
                "dinamic_attendance_FULL_20260930T120000Z.bak",
            ],
        )

    def test_retention_days_validation(self) -> None:
        with self.assertRaises(ValueError):
            select_expired_managed_backups(
                [],
                database="dinamic_attendance",
                now_utc=datetime.now(timezone.utc),
                retention_days=0,
            )

    def test_log_backup_decision_matrix(self) -> None:
        from paths import can_run_log_backup

        # SIMPLE → LOG => reject before BACKUP LOG
        ok, reason = can_run_log_backup(recovery_model="SIMPLE")
        self.assertFalse(ok)
        self.assertIn("refuse LOG", reason)
        self.assertIn("FULL", reason)

        # FULL => allow the BACKUP LOG attempt (SQL Server may still reject missing chain)
        ok2, reason2 = can_run_log_backup(recovery_model="FULL")
        self.assertTrue(ok2)
        self.assertEqual(reason2, "ok")

        ok3, _ = can_run_log_backup(recovery_model="BULK_LOGGED")
        self.assertFalse(ok3)

    def test_full_bootstrap_is_out_of_log_decision_scope(self) -> None:
        """FULL path may ALTER recovery + take FULL; LOG decision only gates LOG."""
        from paths import can_run_log_backup

        ok, _ = can_run_log_backup(recovery_model="SIMPLE")
        self.assertFalse(ok)

    def test_cron_lines_assume_host_utc_no_cron_tz(self) -> None:
        from paths import host_timezone_is_utc, render_backup_cron_lines

        lines = render_backup_cron_lines(
            full_hour_utc=3,
            log_command="/bin/bash /repo/scripts/mssql-backup/run-backup.sh LOG",
            full_command="/bin/bash /repo/scripts/mssql-backup/run-scheduled.sh FULL",
        )
        self.assertTrue(lines[0].startswith("# "))
        self.assertIn("dinamic-mssql-backup-preamble", lines[0])
        self.assertNotIn("CRON_TZ", "\n".join(lines))
        self.assertTrue(lines[1].startswith("*/15 * * * * "))
        self.assertIn("# dinamic-mssql-backup-log", lines[1])
        self.assertTrue(lines[2].startswith("0 3 * * * "))
        self.assertIn("# dinamic-mssql-backup-full", lines[2])
        # Marker must not appear as an env-var value (no `CRON_TZ=UTC # ...`).
        for line in lines:
            self.assertFalse(line.startswith("CRON_TZ="))
        with self.assertRaises(ValueError):
            render_backup_cron_lines(
                full_hour_utc=24,
                log_command="x",
                full_command="y",
            )

        self.assertTrue(host_timezone_is_utc("UTC", 0))
        self.assertTrue(host_timezone_is_utc("Etc/UTC", 0))
        self.assertFalse(host_timezone_is_utc("America/Argentina/Buenos_Aires", -10800))


if __name__ == "__main__":
    unittest.main()
