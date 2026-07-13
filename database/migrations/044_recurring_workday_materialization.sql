-- Phase 4: recurring workday materialization snapshots and query indexes.

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_workdays') AND name = 'schedule_source_snapshot'
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD schedule_source_snapshot NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_workdays') AND name = 'schedule_timezone_snapshot'
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD schedule_timezone_snapshot NVARCHAR(80) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_workdays_schedule_source_snapshot'
      AND parent_object_id = OBJECT_ID('dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT CK_operation_workdays_schedule_source_snapshot
        CHECK (
            schedule_source_snapshot IS NULL
            OR schedule_source_snapshot IN (N'COMPANY', N'CUSTOM')
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_workdays_company_operation_work_date'
      AND object_id = OBJECT_ID('dbo.operation_workdays')
)
BEGIN
    CREATE INDEX IX_operation_workdays_company_operation_work_date
        ON dbo.operation_workdays (company_id, operation_id, work_date);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_operation_workdays_company_work_date_status'
      AND object_id = OBJECT_ID('dbo.operation_workdays')
)
BEGIN
    CREATE INDEX IX_operation_workdays_company_work_date_status
        ON dbo.operation_workdays (company_id, work_date, status);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_employee_workdays_company_operation_workday'
      AND object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    CREATE INDEX IX_employee_workdays_company_operation_workday
        ON dbo.employee_workdays (company_id, operation_workday_id);
END;
GO
