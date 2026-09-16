/*
  Rollback: 135_daily_attendance_report_corrections_rollback.sql

  Reverses additive corrections from 135. Does not drop Phase 1 base tables
  (use 134 rollback for full removal).
*/

USE dinamic_attendance;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_recipient_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT FK_cdard_recipient_company;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_cdard_run_company'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT FK_cdard_run_company;
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_cdard_status'
      AND parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
)
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries DROP CONSTRAINT CK_cdard_status;
END;
GO

IF OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries', N'U') IS NOT NULL
BEGIN
    ALTER TABLE dbo.company_daily_attendance_report_deliveries
        ADD CONSTRAINT CK_cdard_status CHECK (
            status IN (N'PENDING', N'PROCESSING', N'SENT', N'FAILED')
        );
END;
GO

DECLARE @cols TABLE (name SYSNAME);
INSERT INTO @cols (name)
VALUES
    (N'total_incident_count'),
    (N'template_version'),
    (N'email_subject_snapshot'),
    (N'email_text_snapshot'),
    (N'email_html_snapshot'),
    (N'evaluated_at');

DECLARE @col SYSNAME;
DECLARE col_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @cols;
OPEN col_cursor;
FETCH NEXT FROM col_cursor INTO @col;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH(N'dbo.company_daily_attendance_report_runs', @col) IS NOT NULL
    BEGIN
        DECLARE @df SYSNAME;
        SELECT @df = dc.name
        FROM sys.default_constraints dc
        INNER JOIN sys.columns c
          ON c.default_object_id = dc.object_id
         AND c.object_id = dc.parent_object_id
        WHERE dc.parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_runs')
          AND c.name = @col;
        IF @df IS NOT NULL
            EXEC(N'ALTER TABLE dbo.company_daily_attendance_report_runs DROP CONSTRAINT [' + @df + N']');
        EXEC(N'ALTER TABLE dbo.company_daily_attendance_report_runs DROP COLUMN [' + @col + N']');
    END;
    FETCH NEXT FROM col_cursor INTO @col;
END;
CLOSE col_cursor;
DEALLOCATE col_cursor;
GO
