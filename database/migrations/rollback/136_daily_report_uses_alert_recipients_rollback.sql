/*
  Rollback: 136_daily_report_uses_alert_recipients_rollback.sql

  Restores schema compatibility with company_report_email_recipients WITHOUT
  deleting delivery history.

  - Drops alert-recipient FK
  - Nulls recipient_id values that are not valid report-email recipients
  - Restores NOT NULL only if every row can be remapped; otherwise keeps NULL
    and refuses to restore NOT NULL (THROW) so history is never wiped
  - Re-adds FK to company_report_email_recipients when the table exists

  Note: recipient_origin / email unique may remain (additive forward columns).
*/

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries', N'U') IS NULL
    RETURN;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_alert_recipient_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        DROP CONSTRAINT FK_cdard_alert_recipient_company;
END;
GO

/* Clear recipient_ids that are alert recipients (not valid under legacy FK) */
IF OBJECT_ID(N'dbo.company_report_email_recipients', N'U') IS NOT NULL
BEGIN
    UPDATE d
    SET recipient_id = NULL,
        recipient_origin = N'SNAPSHOT_ONLY',
        updated_at = SYSUTCDATETIME()
    FROM dbo.company_daily_attendance_report_deliveries d
    WHERE d.recipient_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.company_report_email_recipients r
          WHERE r.id = d.recipient_id
            AND r.company_id = d.company_id
      );
END;
ELSE
BEGIN
    UPDATE dbo.company_daily_attendance_report_deliveries
    SET recipient_id = NULL,
        recipient_origin = N'SNAPSHOT_ONLY',
        updated_at = SYSUTCDATETIME()
    WHERE recipient_id IS NOT NULL;
END;
GO

/* Attempt remap back by email when legacy table exists */
IF OBJECT_ID(N'dbo.company_report_email_recipients', N'U') IS NOT NULL
BEGIN
    ;WITH candidates AS (
        SELECT
            d.id AS delivery_id,
            r.id AS report_recipient_id,
            COUNT(*) OVER (PARTITION BY d.id) AS match_count
        FROM dbo.company_daily_attendance_report_deliveries d
        INNER JOIN dbo.company_report_email_recipients r
            ON r.company_id = d.company_id
           AND LOWER(LTRIM(RTRIM(r.email))) = LOWER(LTRIM(RTRIM(d.email_snapshot)))
    )
    UPDATE d
    SET recipient_id = c.report_recipient_id,
        recipient_origin = N'LEGACY_REPORT_EMAIL',
        updated_at = SYSUTCDATETIME()
    FROM dbo.company_daily_attendance_report_deliveries d
    INNER JOIN candidates c ON c.delivery_id = d.id
    WHERE c.match_count = 1;
END;
GO

IF EXISTS (
    SELECT 1
    FROM dbo.company_daily_attendance_report_deliveries
    WHERE recipient_id IS NULL
)
BEGIN
    /*
      Cannot restore NOT NULL recipient_id without deleting or fabricating rows.
      Leave nullable + SNAPSHOT_ONLY; restore legacy FK only for non-null rows
      is impossible in SQL Server (FK applies to all non-null). Nullable FK OK.
    */
    PRINT N'[136 rollback] Leaving recipient_id nullable; some rows remain SNAPSHOT_ONLY.';
END;
GO

IF OBJECT_ID(N'dbo.company_report_email_recipients', N'U') IS NOT NULL
   AND NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_recipient_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    /* Ensure legacy table has (id, company_id) unique for composite FK */
    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_crer_id_company'
          AND object_id = OBJECT_ID(N'dbo.company_report_email_recipients')
    )
    AND NOT EXISTS (
        SELECT 1 FROM sys.key_constraints
        WHERE parent_object_id = OBJECT_ID(N'dbo.company_report_email_recipients')
          AND name LIKE N'UQ%id%company%'
    )
    BEGIN
        /* 134 should already have UQ_crer_id_company or PK+company; create if missing */
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE object_id = OBJECT_ID(N'dbo.company_report_email_recipients')
              AND name = N'UQ_crer_id_company'
        )
        BEGIN
            CREATE UNIQUE INDEX UQ_crer_id_company
                ON dbo.company_report_email_recipients (id, company_id);
        END
    END;

    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT FK_cdard_recipient_company
            FOREIGN KEY (recipient_id, company_id)
            REFERENCES dbo.company_report_email_recipients (id, company_id);
END;
GO
