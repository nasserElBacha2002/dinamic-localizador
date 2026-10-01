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

    def test_log_backup_refuses_after_recovery_transition(self) -> None:
        from paths import can_run_log_backup

        ok, reason = can_run_log_backup(
            recovery_before="SIMPLE",
            recovery_after="FULL",
            has_full_backup_row=True,
        )
        self.assertFalse(ok)
        self.assertIn("just changed to FULL", reason)

        ok2, _ = can_run_log_backup(
            recovery_before="FULL",
            recovery_after="FULL",
            has_full_backup_row=True,
        )
        self.assertTrue(ok2)

        ok3, reason3 = can_run_log_backup(
            recovery_before="FULL",
            recovery_after="FULL",
            has_full_backup_row=False,
        )
        self.assertFalse(ok3)
        self.assertIn("no valid FULL", reason3)


if __name__ == "__main__":
    unittest.main()
