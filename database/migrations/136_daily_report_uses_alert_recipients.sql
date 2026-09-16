/*
  Migration: 136_daily_report_uses_alert_recipients.sql

  Retarget daily attendance report deliveries to company_alert_recipients
  WITHOUT deleting historical delivery rows.

  Strategy:
  1) Inspect counts/statuses (logged via PRINT; abort on ambiguous remaps that
     would attach the wrong FK when a unique alert recipient cannot be chosen).
  2) Drop FK to company_report_email_recipients.
  3) Make recipient_id nullable; add recipient_origin + preserve snapshots.
  4) Remap when exactly one enabled/linked alert recipient shares the same
     company_id + user email (case-insensitive) as email_snapshot.
  5) Unmapped rows keep email_snapshot / display_name_snapshot and set
     recipient_id = NULL, recipient_origin = N'SNAPSHOT_ONLY'.
  6) Add filtered FK to company_alert_recipients for non-null recipient_id.
  7) Replace UQ(report_run_id, recipient_id) with UQ(report_run_id, email_snapshot)
     so multiple historical NULLs remain valid.

  Does NOT:
  - DELETE deliveries
  - change SENT / attempt_count / leases / provider IDs
  - activate any company cutover mode
  - change employee WhatsApp flows

  Rollback: rollback/136_daily_report_uses_alert_recipients_rollback.sql
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries', N'U') IS NULL
BEGIN
    THROW 50136, 'Precondition failed: company_daily_attendance_report_deliveries missing', 1;
END;
GO

IF OBJECT_ID(N'dbo.company_alert_recipients', N'U') IS NULL
BEGIN
    THROW 50136, 'Precondition failed: company_alert_recipients missing', 1;
END;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    THROW 50136, 'Precondition failed: users missing', 1;
END;
GO

/* --- Diagnostics (non-destructive) --- */
DECLARE @total INT = (SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries);
DECLARE @sent INT = (SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries WHERE status = N'SENT');
DECLARE @pending INT = (SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries WHERE status = N'PENDING');
DECLARE @processing INT = (SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries WHERE status = N'PROCESSING');
DECLARE @failed INT = (SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries WHERE status = N'FAILED');
DECLARE @failedTerminal INT = (SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries WHERE status = N'FAILED_TERMINAL');

PRINT N'[136] deliveries total=' + CAST(@total AS NVARCHAR(20))
    + N' SENT=' + CAST(@sent AS NVARCHAR(20))
    + N' PENDING=' + CAST(@pending AS NVARCHAR(20))
    + N' PROCESSING=' + CAST(@processing AS NVARCHAR(20))
    + N' FAILED=' + CAST(@failed AS NVARCHAR(20))
    + N' FAILED_TERMINAL=' + CAST(@failedTerminal AS NVARCHAR(20));
GO

/* Drop legacy FKs to company_report_email_recipients */
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_recipient_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        DROP CONSTRAINT FK_cdard_recipient_company;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_recipient'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        DROP CONSTRAINT FK_cdard_recipient;
END;
GO

/* Drop old unique that cannot hold multiple NULL recipient_ids */
IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = N'UQ_cdard_run_recipient'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        DROP CONSTRAINT UQ_cdard_run_recipient;
END;
GO

/* recipient_id becomes optional for historical snapshot-only rows */
IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
      AND name = N'recipient_id'
      AND is_nullable = 0
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ALTER COLUMN recipient_id UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.company_daily_attendance_report_deliveries', N'recipient_origin') IS NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD recipient_origin NVARCHAR(32) NOT NULL
            CONSTRAINT DF_cdard_recipient_origin DEFAULT N'LEGACY_REPORT_EMAIL';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cdard_recipient_origin'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT CK_cdard_recipient_origin CHECK (
            recipient_origin IN (
                N'ALERT_RECIPIENT',
                N'LEGACY_REPORT_EMAIL',
                N'SNAPSHOT_ONLY'
            )
        );
END;
GO

/* Unique on immutable email snapshot per run (always present) */
IF NOT EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = N'UQ_cdard_run_email_snapshot'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT UQ_cdard_run_email_snapshot UNIQUE (report_run_id, email_snapshot);
END;
GO

/* Filtered uniqueness when recipient_id is present */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_cdard_run_recipient_not_null'
      AND object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    CREATE UNIQUE INDEX UQ_cdard_run_recipient_not_null
        ON dbo.company_daily_attendance_report_deliveries (report_run_id, recipient_id)
        WHERE recipient_id IS NOT NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_car_id_company'
      AND object_id = OBJECT_ID(N'dbo.company_alert_recipients')
)
BEGIN
    CREATE UNIQUE INDEX UQ_car_id_company
        ON dbo.company_alert_recipients (id, company_id);
END;
GO

/*
  Remap where email_snapshot uniquely matches a company alert recipient's user email.
  Does not change status, attempt_count, leases, provider ids, or SENT timestamps.
*/
;WITH candidates AS (
    SELECT
        d.id AS delivery_id,
        car.id AS alert_recipient_id,
        COUNT(*) OVER (PARTITION BY d.id) AS match_count
    FROM dbo.company_daily_attendance_report_deliveries d
    INNER JOIN dbo.company_alert_recipients car
        ON car.company_id = d.company_id
       AND car.is_enabled = 1
       AND car.user_id IS NOT NULL
    INNER JOIN dbo.users u
        ON u.id = car.user_id
       AND LOWER(LTRIM(RTRIM(u.email))) = LOWER(LTRIM(RTRIM(d.email_snapshot)))
)
UPDATE d
SET
    recipient_id = c.alert_recipient_id,
    recipient_origin = N'ALERT_RECIPIENT',
    updated_at = SYSUTCDATETIME()
FROM dbo.company_daily_attendance_report_deliveries d
INNER JOIN candidates c ON c.delivery_id = d.id
WHERE c.match_count = 1
  AND (
        d.recipient_id IS NULL
     OR d.recipient_id <> c.alert_recipient_id
     OR d.recipient_origin <> N'ALERT_RECIPIENT'
  );
GO

/* Ambiguous matches: refuse wrong FK; leave snapshot-only */
;WITH ambiguous AS (
    SELECT d.id AS delivery_id
    FROM dbo.company_daily_attendance_report_deliveries d
    INNER JOIN dbo.company_alert_recipients car
        ON car.company_id = d.company_id
       AND car.is_enabled = 1
       AND car.user_id IS NOT NULL
    INNER JOIN dbo.users u
        ON u.id = car.user_id
       AND LOWER(LTRIM(RTRIM(u.email))) = LOWER(LTRIM(RTRIM(d.email_snapshot)))
    GROUP BY d.id
    HAVING COUNT(*) > 1
)
UPDATE d
SET
    recipient_id = NULL,
    recipient_origin = N'SNAPSHOT_ONLY',
    updated_at = SYSUTCDATETIME()
FROM dbo.company_daily_attendance_report_deliveries d
INNER JOIN ambiguous a ON a.delivery_id = d.id;
GO

/*
  Any recipient_id that is not a real company_alert_recipients row must be cleared
  before adding the new FK. Snapshots stay intact; status/attempts untouched.
*/
UPDATE d
SET
    recipient_id = NULL,
    recipient_origin = N'SNAPSHOT_ONLY',
    updated_at = SYSUTCDATETIME()
FROM dbo.company_daily_attendance_report_deliveries d
WHERE d.recipient_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.company_alert_recipients car
      WHERE car.id = d.recipient_id
        AND car.company_id = d.company_id
  );
GO

UPDATE dbo.company_daily_attendance_report_deliveries
SET recipient_origin = N'SNAPSHOT_ONLY',
    updated_at = SYSUTCDATETIME()
WHERE recipient_id IS NULL
  AND recipient_origin <> N'SNAPSHOT_ONLY';
GO

/* Abort if any non-null recipient_id is not a valid alert recipient (would break FK) */
IF EXISTS (
    SELECT 1
    FROM dbo.company_daily_attendance_report_deliveries d
    WHERE d.recipient_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.company_alert_recipients car
          WHERE car.id = d.recipient_id
            AND car.company_id = d.company_id
      )
)
BEGIN
    DECLARE @bad INT = (
        SELECT COUNT(*)
        FROM dbo.company_daily_attendance_report_deliveries d
        WHERE d.recipient_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.company_alert_recipients car
              WHERE car.id = d.recipient_id
                AND car.company_id = d.company_id
          )
    );
    DECLARE @msg NVARCHAR(400) =
        N'[136] Abort: ' + CAST(@bad AS NVARCHAR(20))
        + N' delivery row(s) have recipient_id not in company_alert_recipients. Resolve before retry.';
    THROW 50136, @msg, 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_alert_recipient_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT FK_cdard_alert_recipient_company
            FOREIGN KEY (recipient_id, company_id)
            REFERENCES dbo.company_alert_recipients (id, company_id);
END;
GO

DECLARE @mapped INT = (
    SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries
    WHERE recipient_origin = N'ALERT_RECIPIENT' AND recipient_id IS NOT NULL
);
DECLARE @snapshotOnly INT = (
    SELECT COUNT(*) FROM dbo.company_daily_attendance_report_deliveries
    WHERE recipient_origin = N'SNAPSHOT_ONLY'
);
PRINT N'[136] remap complete: ALERT_RECIPIENT=' + CAST(@mapped AS NVARCHAR(20))
    + N' SNAPSHOT_ONLY=' + CAST(@snapshotOnly AS NVARCHAR(20));
GO
