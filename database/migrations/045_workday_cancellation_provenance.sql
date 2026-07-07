-- Phase 4 review: cancellation provenance for safe schedule reactivation.

USE dinamic_attendance;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.employee_workdays') AND name = 'cancellation_reason'
)
BEGIN
    ALTER TABLE dbo.employee_workdays
        ADD cancellation_reason NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.operation_workdays') AND name = 'cancellation_reason'
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD cancellation_reason NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_employee_workdays_cancellation_reason'
      AND parent_object_id = OBJECT_ID('dbo.employee_workdays')
)
BEGIN
    ALTER TABLE dbo.employee_workdays
        ADD CONSTRAINT CK_employee_workdays_cancellation_reason
        CHECK (
            cancellation_reason IS NULL
            OR cancellation_reason IN (N'ASSIGNMENT', N'SCHEDULE', N'OPERATION')
        );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_operation_workdays_cancellation_reason'
      AND parent_object_id = OBJECT_ID('dbo.operation_workdays')
)
BEGIN
    ALTER TABLE dbo.operation_workdays
        ADD CONSTRAINT CK_operation_workdays_cancellation_reason
        CHECK (
            cancellation_reason IS NULL
            OR cancellation_reason IN (N'SCHEDULE', N'OPERATION')
        );
END;
GO
